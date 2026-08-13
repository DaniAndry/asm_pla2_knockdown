'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  applyAdapterOverride,
  ensureDeveloperOverridesFile,
  getDeveloperOverridesPath,
  getEffectiveProfiles,
  loadDeveloperOverrides,
} = require('../dist/networks/dev-overrides');
const { ADAPTERS } = require('../dist/networks/adapters');
const { packDirectory } = require('../dist/packer/packer');
const { createDefaultSettings } = require('../dist/settings');
const { NETWORK_IDS } = require('../dist/types');

function project() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-overrides-'));
}

function writeConfig(root, source) {
  const file = getDeveloperOverridesPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source, 'utf8');
  return file;
}

function webBuild(root) {
  const input = path.join(root, 'build', 'web-mobile');
  fs.mkdirSync(path.join(input, 'src'), { recursive: true });
  fs.writeFileSync(path.join(input, 'index.html'), '<!doctype html><html><head><title>Override</title></head><body><script src="src/index.js"></script></body></html>');
  fs.writeFileSync(path.join(input, 'src', 'index.js'), 'window.overrideFixture=true;');
  return input;
}

test('developer override template is created once and never overwritten', () => {
  const root = project();
  const first = ensureDeveloperOverridesFile(root);
  assert.equal(first.created, true);
  const template = fs.readFileSync(first.path, 'utf8');
  assert.match(template, /Built-in adapter: AppLovin/);
  assert.match(template, /replace: String\.raw/);
  assert.match(template, /"snapchat_cdn": \{/);
  assert.match(template, /\/\/ compressed: true/);
  assert.doesNotThrow(() => loadDeveloperOverrides(root));
  fs.writeFileSync(first.path, 'module.exports = { schemaVersion: 1, adapters: {}, profiles: {} };', 'utf8');
  const second = ensureDeveloperOverridesFile(root);
  assert.equal(second.created, false);
  assert.equal(fs.readFileSync(second.path, 'utf8').startsWith('module.exports'), true);
});

test('an empty generated override file is repaired with the readable defaults reference', () => {
  const root = project();
  const file = writeConfig(root, '');
  const result = ensureDeveloperOverridesFile(root);
  assert.equal(result.created, false);
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /Built-in adapter: IronSource MRAID/);
  assert.match(source, /Built-in profile defaults/);
  assert.doesNotThrow(() => loadDeveloperOverrides(root));
});

test('adapter text patches and profile partial overrides are applied without identity changes', () => {
  const root = project();
  writeConfig(root, `module.exports = {
    schemaVersion: 1,
    adapters: { applovin: {
      headHtml: { prepend: '<meta name="custom" content="before">' },
      script: { replace: 'CUSTOM_SCRIPT', append: ';CUSTOM_APPEND' }
    } },
    profiles: { applovin: { directory: 'custom-applovin', outputBaseName: 'custom', compressed: false } }
  };`);
  const overrides = loadDeveloperOverrides(root);
  const adapter = applyAdapterOverride(ADAPTERS.applovin, overrides);
  assert.match(adapter.headHtml, /^<meta name="custom"/);
  assert.equal(adapter.script, 'CUSTOM_SCRIPT;CUSTOM_APPEND');
  assert.equal(adapter.id, 'applovin');
  assert.equal(adapter.mraid, 'standard');
  const profile = getEffectiveProfiles(overrides).find((item) => item.key === 'applovin');
  assert.equal(profile.directory, 'custom-applovin');
  assert.equal(profile.outputBaseName, 'custom');
  assert.equal(profile.compressed, false);
  assert.equal(profile.networkId, 'applovin');
});

test('developer overrides reject unknown identity fields, unsafe paths and executable values', () => {
  const cases = [
    [`module.exports={schemaVersion:1,adapters:{unknown:{}},profiles:{}};`, /Unknown developer adapter/],
    [`module.exports={schemaVersion:1,adapters:{},profiles:{applovin:{key:'changed'}}};`, /key.*not supported/],
    [`module.exports={schemaVersion:1,adapters:{},profiles:{applovin:{directory:'..\/escape'}}};`, /stay inside/],
    [`module.exports={schemaVersion:1,adapters:{applovin:{script:{append:function(){}}}},profiles:{}};`, /JSON-compatible/],
    [`module.exports=process;`, /process is not defined/],
    [`while(true){}`, /timed out/i],
  ];
  for (const [source, expression] of cases) {
    const root = project();
    writeConfig(root, source);
    assert.throws(() => loadDeveloperOverrides(root), expression);
  }
});

test('mandatory post-build assertions run after developer overrides', async () => {
  const root = project();
  const input = webBuild(root);
  writeConfig(root, `module.exports={
    schemaVersion:1,
    adapters:{google:{script:{replace:''}}},
    profiles:{}
  };`);
  const settings = createDefaultSettings();
  settings.obfuscate = false;
  for (const id of NETWORK_IDS) settings.networks[id] = false;
  settings.networks.google = true;
  await assert.rejects(
    () => packDirectory(input, settings, { projectPath: root }),
    /direct ExitApi\.exit\(\) call is missing/,
  );
});

test('flat developer profile overrides cannot publish colliding files', async () => {
  const root = project();
  const input = webBuild(root);
  writeConfig(root, `module.exports={schemaVersion:1,adapters:{},profiles:{
    applovin:{outputBaseName:'same'}, adcolony:{outputBaseName:'same'}
  }};`);
  const settings = createDefaultSettings();
  settings.obfuscate = false;
  settings.createTargetSubfolders = false;
  for (const id of NETWORK_IDS) settings.networks[id] = false;
  settings.networks.applovin = true;
  settings.networks.adcolony = true;
  await assert.rejects(
    () => packDirectory(input, settings, { projectPath: root }),
    /output collision.*same\.html/,
  );
});
