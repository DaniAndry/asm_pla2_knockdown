'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const JSZip = require('jszip');
const { JSDOM } = require('jsdom');
const { GOOGLE_EXIT_API_URL, OUTPUT_DIRECTORY } = require('../dist/constants');
const { decodeBase122 } = require('../dist/codec/base122');
const { insertBeforeClosingTag, packDirectory } = require('../dist/packer/packer');
const { getBrowserRuntimeSource } = require('../dist/packer/runtime');
const { getPlayableBridgeSource } = require('../dist/packer/playable-bridge');
const { createDefaultSettings } = require('../dist/settings');
const { ADAPTERS } = require('../dist/networks/adapters');
const { NETWORK_IDS } = require('../dist/types');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-packer-'));
  const input = path.join(root, 'build', 'web-mobile');
  fs.mkdirSync(path.join(input, 'src'), { recursive: true });
  fs.mkdirSync(path.join(input, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(input, 'index.html'), `<!doctype html>
<html><head><meta charset="utf-8"><title>Cocos Creator - Fixture Game</title>
<link rel="stylesheet" href="style.css"></head>
<body><canvas id="GameCanvas"></canvas><img src="assets/pixel.png">
<script src="src/system.js"></script>
<script src="src/import-map.json" type="systemjs-importmap"></script>
<script>window.__fixtureBooted = true;</script>
</body></html>`);
  fs.writeFileSync(path.join(input, 'style.css'), '@font-face{font-family:x;src:url("assets/font.woff")}body{background:url(assets/pixel.png)}');
  fs.writeFileSync(path.join(input, 'src', 'system.js'), 'window.__fixtureSystem = true;');
  fs.writeFileSync(path.join(input, 'src', 'settings.json'), JSON.stringify({
    splashScreen: {
      displayRatio: 1,
      totalTime: 2000,
      logo: { type: 'default' },
      background: { type: 'default' },
      autoFit: true,
      watermarkLocation: 'default',
    },
  }));
  fs.writeFileSync(
    path.join(input, 'src', 'import-map.json'),
    JSON.stringify({ imports: { cc: './../cocos-js/cc.js' } }),
  );
  fs.writeFileSync(path.join(input, 'assets', 'pixel.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(path.join(input, 'assets', 'sound.mp3'), Buffer.from('ID3fixture'));
  fs.writeFileSync(path.join(input, 'assets', 'font.woff'), Buffer.from('wOFFfixture'));
  fs.writeFileSync(
    path.join(input, 'assets', 'font.ttf'),
    Buffer.from(Array.from({ length: 2048 }, (_, index) => (index * 47) & 255)),
  );
  fs.writeFileSync(path.join(input, 'assets', 'module.wasm'), Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]));
  return { root, input };
}

function selectedSettings(encoding) {
  const settings = createDefaultSettings();
  settings.variants[0].name = 'Fixture Variation';
  settings.assetEncoding = encoding;
  settings.obfuscate = false;
  for (const id of NETWORK_IDS) settings.networks[id] = false;
  settings.networks.default = true;
  settings.networks.google = true;
  settings.networks.ironsource = true;
  return settings;
}

function onlyFile(directory, extension) {
  const values = fs.readdirSync(directory).filter((file) => file.endsWith(extension));
  assert.equal(values.length, 1);
  return path.join(directory, values[0]);
}

function payloadFromHtml(html) {
  const match = html.match(/window\.__CGB_PAYLOAD__=("(?:\\.|[^"\\])*");/);
  assert.ok(match, 'payload assignment exists');
  return Function(`return ${match[1]}`)();
}

test('HTML insertion treats Base122 replacement tokens as literal text', () => {
  const tokens = "$&$`$'";
  assert.equal(
    insertBeforeClosingTag('<html><body>fixture</body></html>', 'body', tokens),
    `<html><body>fixture${tokens}\n</body></html>`,
  );
});

test('packer creates selected profiles, grouped Google ZIPs and skips disabled DAPI output', async () => {
  const { input } = fixture();
  const result = await packDirectory(input, selectedSettings('base64'));
  assert.ok(fs.existsSync(path.join(result.outputDirectory, 'default')));
  assert.equal(fs.existsSync(path.join(result.outputDirectory, 'common')), false);
  assert.equal(fs.existsSync(path.join(result.outputDirectory, 'common_min')), false);
  assert.ok(fs.existsSync(path.join(result.outputDirectory, 'ironsource')));
  assert.ok(fs.existsSync(path.join(result.outputDirectory, 'google')));
  assert.equal(fs.existsSync(path.join(result.outputDirectory, 'applovin')), false);
  assert.equal(fs.existsSync(path.join(result.outputDirectory, 'ironsourcemraid')), false);
  assert.equal(fs.existsSync(path.join(result.outputDirectory, 'ironsource-dapi')), false);
  assert.equal(result.files.filter((file) => file.startsWith(`google${path.sep}`)).length, 3);
  assert.equal(path.basename(result.outputDirectory), OUTPUT_DIRECTORY);
  assert.ok(result.files.every((file) => path.basename(file).startsWith('Fixture Variation%')));
  const defaultHtml = fs.readFileSync(
    onlyFile(path.join(result.outputDirectory, 'default'), '.html'),
    'utf8',
  );
  assert.doesNotMatch(defaultHtml, /"value":"src\/import-map\.json"/);
  assert.match(
    defaultHtml,
    /<script type="systemjs-importmap">\{"imports":\{"cc":"\.\/cocos-js\/cc\.js"\}\}<\/script>/,
  );
  assert.match(defaultHtml, /installCgbPlayableBridge/);
  assert.match(defaultHtml, /window\.super_html_channel="default"/);
  assert.match(defaultHtml, /window\.nameplatform = 'default'/);
  assert.match(defaultHtml, /window\.super_html_playable/);
  assert.match(defaultHtml, /typeof api\.game_end !== 'function'/);

  for (const zipName of fs.readdirSync(path.join(result.outputDirectory, 'google'))) {
    const zip = await JSZip.loadAsync(fs.readFileSync(path.join(result.outputDirectory, 'google', zipName)));
    const html = await zip.file('index.html').async('string');
    assert.ok(html.includes(GOOGLE_EXIT_API_URL));
    assert.match(html, /\bExitApi\.exit\s*\(\s*\)/);
    assert.doesNotMatch(html, /window\.open\s*\([^)]*ExitApi\.exit/);
  }
});

test('Default is optional and legacy common outputs are never generated', async () => {
  const { input } = fixture();
  const settings = createDefaultSettings();
  settings.obfuscate = false;
  for (const id of NETWORK_IDS) settings.networks[id] = false;
  const result = await packDirectory(input, settings);
  assert.deepEqual(result.files, []);
  assert.equal(fs.existsSync(path.join(result.outputDirectory, 'default')), false);
  assert.equal(fs.existsSync(path.join(result.outputDirectory, 'common')), false);
  assert.equal(fs.existsSync(path.join(result.outputDirectory, 'common_min')), false);
});

test('variation Splash is injected after Builder output and embedded in the selected codec', async () => {
  const { root, input } = fixture();
  const logo = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 8, 7, 6]);
  const logoPath = path.join(root, 'settings', 'splash', 'logo.png');
  fs.mkdirSync(path.dirname(logoPath), { recursive: true });
  fs.writeFileSync(logoPath, logo);
  const settings = selectedSettings('base64');
  for (const id of NETWORK_IDS) settings.networks[id] = false;
  settings.networks.default = true;
  const variant = settings.variants[0];
  variant.splash.mode = 'override';
  variant.splash.displayRatio = 1.5;
  variant.splash.logo = { type: 'custom', file: 'settings/splash/logo.png' };
  variant.splash.background = { type: 'color', color: { x: 1, y: 0, z: 0, w: 1 } };

  for (const encoding of ['base64', 'base122']) {
    settings.assetEncoding = encoding;
    const result = await packDirectory(input, settings, {
      variationFolder: variant.name,
      variantId: variant.id,
      projectPath: root,
    });
    const html = fs.readFileSync(onlyFile(path.join(result.outputDirectory, 'default'), '.html'), 'utf8');
    const payload = payloadFromHtml(html);
    const bytes = encoding === 'base122'
      ? Buffer.from(decodeBase122(payload))
      : Buffer.from(payload, 'base64');
    const zip = await JSZip.loadAsync(bytes);
    const manifest = JSON.parse(await zip.file('__cgb_manifest__.json').async('string'));
    const settingsEntry = manifest.entries.find((entry) => entry.path === 'src/settings.json');
    const cocosSettings = JSON.parse(await zip.file(settingsEntry.archivePath).async('string'));
    assert.equal(cocosSettings.splashScreen.displayRatio, 1.5);
    assert.deepEqual(cocosSettings.splashScreen.background.color, { x: 1, y: 0, z: 0, w: 1 });
    const embeddedPath = cocosSettings.splashScreen.logo.base64.replace('cgb://', '');
    const logoEntry = manifest.entries.find((entry) => entry.path === embeddedPath);
    assert.deepEqual(await zip.file(logoEntry.archivePath).async('nodebuffer'), logo);
  }
});

test('legacy common outputs are preserved as user artifacts', async () => {
  const { input } = fixture();
  const output = path.join(path.dirname(input), OUTPUT_DIRECTORY);
  fs.mkdirSync(path.join(output, 'common'), { recursive: true });
  fs.mkdirSync(path.join(output, 'common_min'), { recursive: true });
  fs.writeFileSync(path.join(output, 'common', 'legacy.html'), 'legacy common');
  fs.writeFileSync(path.join(output, 'common_min', 'legacy.html'), 'legacy common_min');
  const settings = createDefaultSettings();
  settings.obfuscate = false;
  for (const id of NETWORK_IDS) settings.networks[id] = false;
  settings.networks.default = true;
  await packDirectory(input, settings);
  assert.equal(fs.readFileSync(path.join(output, 'common', 'legacy.html'), 'utf8'), 'legacy common');
  assert.equal(fs.readFileSync(path.join(output, 'common_min', 'legacy.html'), 'utf8'), 'legacy common_min');
});

test('IronSource MRAID and DAPI targets are independent and contain only their protocol', async () => {
  const { input } = fixture();
  const settings = createDefaultSettings();
  settings.obfuscate = false;
  for (const id of NETWORK_IDS) settings.networks[id] = false;
  settings.networks.ironsource = true;
  settings.networks.ironsource_dapi = true;
  const result = await packDirectory(input, settings);
  const mraid = fs.readFileSync(onlyFile(path.join(result.outputDirectory, 'ironsource'), '.html'), 'utf8');
  const dapi = fs.readFileSync(onlyFile(path.join(result.outputDirectory, 'ironsource-dapi'), '.html'), 'utf8');
  assert.match(mraid, /api\.addEventListener\('viewableChange'/);
  assert.doesNotMatch(mraid, /DAPI_SERVICE|openStoreUrl/);
  assert.match(dapi, /DAPI_SERVICE:/);
  assert.match(dapi, /dapi\.openStoreUrl/);
  assert.match(dapi, /viewableChange/);
  assert.match(dapi, /adResized/);
  assert.match(dapi, /audioVolumeChange/);
  assert.doesNotMatch(dapi, /mraid\.addEventListener/);

  settings.networks.ironsource = false;
  const second = await packDirectory(input, settings, 'Dapi only');
  assert.equal(fs.existsSync(path.join(second.outputDirectory, 'ironsource')), false);
  assert.ok(fs.existsSync(path.join(second.outputDirectory, 'ironsource-dapi')));
});

test('MRAID Universal clones IronSource MRAID lifecycle with independent output', async () => {
  const { input } = fixture();
  const settings = createDefaultSettings();
  settings.obfuscate = false;
  for (const id of NETWORK_IDS) settings.networks[id] = false;
  settings.networks.mraid_universal = true;
  const result = await packDirectory(input, settings);
  assert.equal(fs.existsSync(path.join(result.outputDirectory, 'ironsource')), false);
  assert.equal(fs.existsSync(path.join(result.outputDirectory, 'ironsource-dapi')), false);
  const universal = fs.readFileSync(
    onlyFile(path.join(result.outputDirectory, 'mraid-universal'), '.html'),
    'utf8',
  );
  assert.match(universal, /window\.nameplatform = "mraid-universal"/);
  assert.match(universal, /api\.addEventListener\('ready'/);
  assert.match(universal, /api\.addEventListener\('viewableChange'/);
  assert.match(universal, /api\.addEventListener\('audioVolumeChange'/);
  assert.match(universal, /mraid\.open\(target\)/);
  assert.match(universal, /game_end/);
  assert.doesNotMatch(universal, /DAPI_SERVICE|openStoreUrl/);
  assert.ok(result.files.some((file) => path.basename(file).includes('%mraid_universal.html')));
});

test('Unity exposes validator-visible store URLs after project script obfuscation', async () => {
  const { input } = fixture();
  fs.mkdirSync(path.join(input, 'assets', 'main'), { recursive: true });
  fs.writeFileSync(path.join(input, 'assets', 'main', 'index.js'), `
    playable.set_google_play_url("https://play.google.com/store/apps/details?id=com.fixture.game");
    playable.set_app_store_url("https://apps.apple.com/us/app/fixture/id1234567890");
  `);
  const settings = createDefaultSettings();
  settings.obfuscate = true;
  for (const id of NETWORK_IDS) settings.networks[id] = false;
  settings.networks.unity = true;
  const result = await packDirectory(input, settings);
  const html = fs.readFileSync(onlyFile(path.join(result.outputDirectory, 'unity'), '.html'), 'utf8');
  assert.match(
    html,
    /mraid\.open\("https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.fixture\.game"\)/,
  );
  assert.match(
    html,
    /mraid\.open\("https:\/\/apps\.apple\.com\/us\/app\/fixture\/id1234567890"\)/,
  );
  assert.match(html, /google_play_url: cgbUnityPrevious\.google_play_url/);
  assert.match(html, /appstore_url: cgbUnityPrevious\.appstore_url/);
});

test('Unity target rejects a build without a valid store URL', async () => {
  const { input } = fixture();
  const settings = createDefaultSettings();
  for (const id of NETWORK_IDS) settings.networks[id] = false;
  settings.networks.unity = true;
  await assert.rejects(
    () => packDirectory(input, settings),
    /Unity target requires a valid Google Play or App Store URL/,
  );
});

test('Snapchat creates Ads API and CDN ZIPs with variant config and payload', async () => {
  for (const encoding of ['base64', 'base122']) {
    const { input } = fixture();
    const settings = createDefaultSettings();
    settings.assetEncoding = encoding;
    settings.obfuscate = true;
    for (const id of NETWORK_IDS) settings.networks[id] = false;
    settings.networks.snapchat = true;
    const variant = settings.variants[0];
    variant.name = 'Snap fixture';
    variant.snapchat = {
      cdnFolder: 'snap-fixture-123',
      configJson: '{\n  "custom": "kept"\n}',
    };
    const result = await packDirectory(input, settings, {
      variationFolder: 'Snap fixture',
      variantId: variant.id,
    });
    const target = path.join(result.outputDirectory, 'snapchat');
    const zipFiles = fs.readdirSync(target).filter((file) => file.endsWith('.zip')).sort();
    assert.equal(zipFiles.length, 2);

    const inlinePath = path.join(target, zipFiles.find((file) => file.includes('%snapchat.zip')));
    const inlineZip = await JSZip.loadAsync(fs.readFileSync(inlinePath));
    const inlineEntries = Object.values(inlineZip.files).filter((entry) => !entry.dir).map((entry) => entry.name).sort();
    assert.deepEqual(inlineEntries, ['config.json', 'index.html']);
    assert.deepEqual(JSON.parse(await inlineZip.file('config.json').async('string')), { custom: 'kept' });
    const inlineHtml = await inlineZip.file('index.html').async('string');
    assert.match(inlineHtml, /<script src="mraid\.js"><\/script>/);
    assert.match(inlineHtml, /function snapchatCta\s*\(\s*\)/);
    assert.match(inlineHtml, /\{\{ \.ClickTrackingUrl \}\}/);
    assert.match(inlineHtml, /window\.__CGB_PAYLOAD__=/);

    const cdnPath = path.join(target, zipFiles.find((file) => file.includes('%snapchat_cdn.zip')));
    const cdnZip = await JSZip.loadAsync(fs.readFileSync(cdnPath));
    const cdnEntries = Object.values(cdnZip.files).filter((entry) => !entry.dir).map((entry) => entry.name).sort();
    assert.deepEqual(cdnEntries, ['config.json', 'index.html', 'snap-fixture-123/res.js']);
    const cdnHtml = await cdnZip.file('index.html').async('string');
    assert.match(cdnHtml, /https:\/\/rtb-ads\.shadow\.snapads\.com\/html5\/snap-fixture-123\/res\.js/);
    assert.doesNotMatch(cdnHtml, /window\.__CGB_PAYLOAD__=/);
    assert.match(await cdnZip.file('snap-fixture-123/res.js').async('string'), /window\.__CGB_PAYLOAD__=/);
  }
});

test('invalid Snapchat settings block only builds with Snapchat enabled', async () => {
  const { input } = fixture();
  const settings = selectedSettings('base64');
  const variant = settings.variants[0];
  variant.name = 'Broken Snap';
  variant.snapchat.configJson = '{broken';
  settings.networks.snapchat = true;
  await assert.rejects(() => packDirectory(input, settings), /Broken Snap.*position/i);
  settings.networks.snapchat = false;
  await assert.doesNotReject(() => packDirectory(input, settings));

  settings.networks.snapchat = true;
  variant.snapchat.configJson = '{}';
  variant.snapchat.cdnFolder = '../unsafe';
  await assert.rejects(() => packDirectory(input, settings), /Snapchat CDN folder.*Broken Snap/);
});

test('flat output writes all current targets into the variation root without deleting old layout', async () => {
  const { input } = fixture();
  const settings = createDefaultSettings();
  settings.obfuscate = false;
  settings.createTargetSubfolders = false;
  for (const id of NETWORK_IDS) settings.networks[id] = false;
  settings.networks.default = true;
  settings.networks.google = true;
  settings.networks.ironsource = true;
  settings.networks.ironsource_dapi = true;
  settings.networks.mraid_universal = true;
  settings.networks.snapchat = true;
  settings.networks.adcolony = true;
  const variant = settings.variants[0];
  variant.snapchat.cdnFolder = 'flat-snap';
  const output = path.join(path.dirname(input), OUTPUT_DIRECTORY, 'Flat');
  fs.mkdirSync(path.join(output, 'google'), { recursive: true });
  fs.writeFileSync(path.join(output, 'google', 'old.zip'), 'old layout');

  const result = await packDirectory(input, settings, { variationFolder: 'Flat', variantId: variant.id });
  assert.ok(result.files.every((file) => path.dirname(file) === '.'));
  const names = fs.readdirSync(result.outputDirectory, { withFileTypes: true });
  const generated = names.filter((entry) => entry.isFile()).map((entry) => entry.name);
  assert.equal(new Set(generated).size, generated.length);
  assert.ok(generated.some((name) => name.includes('%default.html')));
  assert.equal(generated.some((name) => name.includes('%common.html')), false);
  assert.equal(generated.some((name) => name.includes('%common_min.html')), false);
  assert.ok(generated.some((name) => name.includes('%ironsource.html')));
  assert.ok(generated.some((name) => name.includes('%ironsource_dapi.html')));
  assert.ok(generated.some((name) => name.includes('%mraid_universal.html')));
  assert.ok(generated.some((name) => name.includes('%snapchat.zip')));
  assert.ok(generated.some((name) => name.includes('%snapchat_cdn.zip')));
  assert.ok(generated.some((name) => name.includes('%adcolony.html')));
  assert.equal(fs.readFileSync(path.join(output, 'google', 'old.zip'), 'utf8'), 'old layout');
});

test('Base64 and Base122 containers preserve text, image, audio, font and WASM bytes', async () => {
  for (const encoding of ['base64', 'base122']) {
    const { input } = fixture();
    const result = await packDirectory(input, selectedSettings(encoding));
    assert.ok(
      result.files.every(
        (file) => path.basename(file).startsWith('Fixture Variation%'),
      ),
    );
    assert.ok(result.files.every((file) => !/_(?:b64|b122)%/.test(path.basename(file))));
    const defaultHtml = fs.readFileSync(onlyFile(path.join(result.outputDirectory, 'default'), '.html'), 'utf8');
    const payload = payloadFromHtml(defaultHtml);
    const archiveBytes = encoding === 'base122'
      ? Buffer.from(decodeBase122(payload))
      : Buffer.from(payload, 'base64');
    const zip = await JSZip.loadAsync(archiveBytes);
    const manifest = JSON.parse(await zip.file('__cgb_manifest__.json').async('string'));
    const entries = new Map(manifest.entries.map((entry) => [entry.path, entry]));
    for (const resource of [
      'style.css',
      'src/system.js',
      'assets/pixel.png',
      'assets/sound.mp3',
      'assets/font.woff',
      'assets/font.ttf',
      'assets/module.wasm',
    ]) {
      assert.ok(entries.has(resource), `${encoding}: ${resource}`);
      const entry = entries.get(resource);
      const bytes = await zip.file(entry.archivePath).async('nodebuffer');
      assert.ok(bytes.length > 0, `${encoding}: ${resource} has data`);
      if (resource === 'assets/font.ttf') {
        const original = fs.readFileSync(path.join(input, resource));
        assert.equal(bytes.length, original.length);
        assert.equal(
          crypto.createHash('sha256').update(bytes).digest('hex'),
          crypto.createHash('sha256').update(original).digest('hex'),
        );
        assert.match(entry.mime, /font\/ttf|application\/x-font-ttf/);
      }
    }
    assert.match(defaultHtml, /URL\.createObjectURL/);
    assert.match(defaultHtml, /new Response/);
    assert.match(defaultHtml, /LocalXMLHttpRequest/);
    if (encoding === 'base122') {
      assert.equal(defaultHtml.includes(';base64,'), false);
    }
  }
});

test('variation output is isolated and leaves sibling variations and flat files intact', async () => {
  const { input } = fixture();
  const rootOutput = path.join(path.dirname(input), OUTPUT_DIRECTORY);
  fs.mkdirSync(path.join(rootOutput, 'Other'), { recursive: true });
  fs.writeFileSync(path.join(rootOutput, 'Other', 'keep.txt'), 'other variation');
  fs.writeFileSync(path.join(rootOutput, 'legacy-flat.html'), 'legacy flat');

  const result = await packDirectory(input, selectedSettings('base64'), 'Main');
  assert.equal(result.outputDirectory, path.join(rootOutput, 'Main'));
  assert.ok(fs.existsSync(path.join(result.outputDirectory, 'default')));
  assert.equal(
    fs.readFileSync(path.join(rootOutput, 'Other', 'keep.txt'), 'utf8'),
    'other variation',
  );
  assert.equal(fs.readFileSync(path.join(rootOutput, 'legacy-flat.html'), 'utf8'), 'legacy flat');
  assert.equal(
    fs.readdirSync(path.dirname(rootOutput))
      .some((name) => name.startsWith(`${OUTPUT_DIRECTORY}.cgb-staging-`)),
    false,
  );
});

test('failed pack keeps the previous CGB output', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-preserve-'));
  const input = path.join(root, 'build', 'web-mobile');
  const output = path.join(root, 'build', OUTPUT_DIRECTORY);
  fs.mkdirSync(input, { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'previous.txt'), 'keep');
  await assert.rejects(() => packDirectory(input, selectedSettings('base64')), /index\.html/);
  assert.equal(fs.readFileSync(path.join(output, 'previous.txt'), 'utf8'), 'keep');
});

test('repacking the same playable replaces its files without duplicates', async () => {
  const { input } = fixture();
  const settings = selectedSettings('base64');
  const first = await packDirectory(input, settings);
  const firstDefault = onlyFile(path.join(first.outputDirectory, 'default'), '.html');
  const firstContents = fs.readFileSync(firstDefault);
  fs.appendFileSync(path.join(input, 'src', 'system.js'), '\nwindow.__iteration = 2;');
  const second = await packDirectory(input, settings);
  const defaultFiles = fs.readdirSync(path.join(second.outputDirectory, 'default'))
    .filter((file) => file.endsWith('.html'))
    .sort();
  assert.equal(defaultFiles.length, 1);
  assert.ok(fs.existsSync(firstDefault));
  assert.notDeepEqual(fs.readFileSync(firstDefault), firstContents);
});

test('file prefix follows the variation name and ignores the HTML title', async () => {
  const { input } = fixture();
  const settings = selectedSettings('base64');
  settings.variants[0].name = 'Variation Alpha';
  const first = await packDirectory(input, settings);
  const indexPath = path.join(input, 'index.html');
  fs.writeFileSync(
    indexPath,
    fs.readFileSync(indexPath, 'utf8').replace(
      '<title>Cocos Creator - Fixture Game</title>',
      '<title>Cocos Creator - Fixture Game 2</title>',
    ),
  );
  const second = await packDirectory(input, settings);
  let defaultFiles = fs.readdirSync(path.join(second.outputDirectory, 'default'))
    .filter((file) => file.endsWith('.html'))
    .sort();
  assert.deepEqual(defaultFiles, ['Variation Alpha%default.html']);

  settings.variants[0].name = 'Variation Beta';
  const third = await packDirectory(input, settings);
  defaultFiles = fs.readdirSync(path.join(third.outputDirectory, 'default'))
    .filter((file) => file.endsWith('.html'))
    .sort();
  assert.deepEqual(defaultFiles, [
    'Variation Alpha%default.html',
    'Variation Beta%default.html',
  ]);
  assert.ok(fs.existsSync(first.outputDirectory));
});

test('legacy super-html overlay contains the official direct Exit API implementation', () => {
  const overlay = require('../../super-html/dist/core/config/google_overlay.js');
  const utilsModule = require('../../super-html/dist/core/common/utils.js');
  const utils = utilsModule.default || utilsModule;
  for (const variant of ['google', 'google_portrait', 'google_landscape']) {
    assert.ok(overlay[`channel/${variant}/meta.html`].includes(GOOGLE_EXIT_API_URL));
    assert.match(overlay[`channel/${variant}/script.js`], /\bExitApi\.exit\s*\(\s*\)/);
    assert.doesNotMatch(overlay[`channel/${variant}/script.js`], /window\.open/);
    assert.equal(utils.get_json(`channel/${variant}/script.js`), overlay[`channel/${variant}/script.js`]);
  }
});

function adapterDom(adapter, userAgent, previous = {}, mraid) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'dangerously',
    url: 'https://preview.invalid/',
  });
  Object.defineProperty(dom.window.navigator, 'userAgent', { value: userAgent, configurable: true });
  dom.window.super_html = previous;
  if (mraid) dom.window.mraid = mraid;
  dom.window.eval(`
    window.super_log = function () {};
    window.super_boot_engine = function () {};
    window.super_check_channel = function () { return Boolean(window.mraid); };
  `);
  dom.window.eval(adapter.script);
  dom.window.eval(getPlayableBridgeSource());
  return dom;
}

test('AppLovin CTA keeps store URLs, honors explicit URL and never opens a blank browser tab', () => {
  const android = adapterDom(ADAPTERS.applovin, 'Android', {
    google_play_url: 'https://play.example/app',
    appstore_url: 'https://apps.example/app',
  });
  const androidOpened = [];
  android.window.open = (...args) => androidOpened.push(args);
  android.window.super_html.download();
  android.window.super_html.download('https://explicit.example/app');
  assert.deepEqual(androidOpened.map((args) => args[0]), [
    'https://play.example/app',
    'https://explicit.example/app',
  ]);
  android.window.close();

  const ios = adapterDom(ADAPTERS.applovin, 'iPhone', {
    google_play_url: 'https://play.example/app',
    appstore_url: 'https://apps.example/app',
  });
  const iosOpened = [];
  ios.window.open = (...args) => iosOpened.push(args);
  ios.window.super_html.download();
  assert.equal(iosOpened[0][0], 'https://apps.example/app');
  ios.window.close();

  const missing = adapterDom(ADAPTERS.applovin, 'Android');
  let blankCalls = 0;
  let errors = 0;
  missing.window.open = () => { blankCalls += 1; };
  missing.window.console.error = () => { errors += 1; };
  missing.window.super_html.download();
  assert.equal(blankCalls, 0);
  assert.equal(errors, 1);
  missing.window.close();

  const mraidCalls = [];
  const network = adapterDom(ADAPTERS.applovin, 'Android', {
    google_play_url: 'https://play.example/app',
  }, {
    open(...args) { mraidCalls.push(args); },
  });
  network.window.super_html.download();
  network.window.super_html.download('https://explicit.example/app');
  assert.deepEqual(mraidCalls, [
    ['https://play.example/app'],
    ['https://explicit.example/app'],
  ]);
  network.window.close();
});

test('legacy AdColony exposes MRAID lifecycle and browser-safe CTA', () => {
  assert.equal(ADAPTERS.adcolony.mraid, 'standard');
  assert.match(ADAPTERS.adcolony.headHtml, /mraid\.js/);
  assert.match(ADAPTERS.adcolony.script, /mraid\.open\(target\)/);
  assert.match(ADAPTERS.adcolony.script, /window\.open\(target, '_blank'\)/);
  assert.doesNotMatch(ADAPTERS.adcolony.script, /window\.open\('', '_blank'\)/);
});

test('playable bridge exposes canonical cgb APIs and preserves the super_html_playable project contract', () => {
  const dom = new JSDOM('<!doctype html><html></html>', {
    runScripts: 'dangerously',
    url: 'https://preview.invalid/',
  });
  let ended = 0;
  dom.window.gameEnd = () => { ended += 1; };
  dom.window.super_html = {};
  dom.window.eval(getPlayableBridgeSource());
  assert.equal(dom.window.cgb, dom.window.super_html);
  assert.equal(typeof dom.window.cgb.download, 'function');
  assert.equal(typeof dom.window.cgb.gameEnd, 'function');
  assert.equal(typeof dom.window.cgb.gameReady, 'function');
  assert.equal(typeof dom.window.cgb.isDownloadHidden, 'function');
  assert.equal(typeof dom.window.cgb.setGooglePlayUrl, 'function');
  assert.equal(typeof dom.window.cgb.setAppStoreUrl, 'function');
  assert.equal(typeof dom.window.super_html.download, 'function');
  assert.equal(typeof dom.window.super_html.game_end, 'function');
  assert.equal(typeof dom.window.super_html.game_ready, 'function');
  assert.equal(dom.window.super_html.is_hide_download(), false);
  dom.window.super_html_playable.set_google_play_url('https://play.example/game');
  dom.window.super_html_playable.set_app_store_url('https://apps.example/game');
  assert.equal(dom.window.super_html.google_play_url, 'https://play.example/game');
  assert.equal(dom.window.super_html.appstore_url, 'https://apps.example/game');
  dom.window.super_html_playable.game_end();
  assert.equal(ended, 1);
  dom.window.cgb.gameEnd();
  assert.equal(ended, 2);
  dom.window.close();
});

test('browser runtime is syntactically valid as a standalone inline script', () => {
  const runtime = getBrowserRuntimeSource();
  assert.doesNotThrow(() => new Function(runtime));
  assert.match(runtime, /\['crossOrigin', 'integrity'\]/);
  assert.match(runtime, /installDynamicStyleInterceptors/);
  assert.match(runtime, /CSSStyleSheet/);
});

test('Emscripten auxiliary resources resolve by a unique trailing path without a false error', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'file:///E:/build/cgb-playable-ready/variation/applovin/playable.html',
  });
  let blobCounter = 0;
  const errors = [];
  dom.window.URL.createObjectURL = () => `blob:cgb-native-${++blobCounter}`;
  dom.window.console.error = (...values) => errors.push(values);
  dom.window.__CGB_ENCODING__ = 'base64';
  dom.window.__CGB_PAYLOAD__ = '';
  dom.window.__CGB_STARTUP__ = [];
  dom.window.__CGB_STYLESHEETS__ = [];
  dom.window.JSZip = {
    async loadAsync() {
      return {
        file(name) {
          if (name === '__cgb_manifest__.json') {
            return {
              async async() {
                return JSON.stringify({
                  entries: [{
                    path: 'cocos-js/assets/spine.js.mem-fixture.bin',
                    archivePath: 'files/spine.bin',
                    mime: 'application/octet-stream',
                    type: 'binary',
                  }],
                });
              },
            };
          }
          if (name === 'files/spine.bin') {
            return { async async() { return new Uint8Array([1, 2, 3, 4]); } };
          }
          return null;
        },
      };
    },
  };
  dom.window.eval(getBrowserRuntimeSource());
  await dom.window.__cgbStart();
  assert.equal(
    dom.window.getRes('file:///E:/build/cgb-playable-ready/variation/applovin/assets/spine.js.mem-fixture.bin'),
    'blob:cgb-native-1',
  );
  assert.equal(errors.length, 0);
  dom.window.close();
});

test('dynamic @font-face is rewritten to a Blob URL before style insertion', async () => {
  let blobCounter = 0;
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'dangerously',
    url: 'file:///fixture/common.html',
  });
  dom.window.URL.createObjectURL = () => `blob:cgb-font-${++blobCounter}`;
  dom.window.__CGB_ENCODING__ = 'base64';
  dom.window.__CGB_PAYLOAD__ = '';
  dom.window.__CGB_STARTUP__ = [];
  dom.window.__CGB_STYLESHEETS__ = [];
  dom.window.JSZip = {
    async loadAsync() {
      return {
        file(name) {
          if (name === '__cgb_manifest__.json') {
            return {
              async async() {
                return JSON.stringify({
                  entries: [{
                    path: 'assets/font.ttf',
                    archivePath: 'resources/font.bin',
                    mime: 'font/ttf',
                    type: 'binary',
                  }],
                });
              },
            };
          }
          if (name === 'resources/font.bin') {
            return {
              async async() {
                return new Uint8Array([0, 1, 2, 3, 4, 5]);
              },
            };
          }
          return null;
        },
      };
    },
  };
  dom.window.eval(getBrowserRuntimeSource());
  await dom.window.__cgbStart();
  assert.ok(dom.window.__cgbResources, 'runtime unpacked the archive');
  assert.equal(
    dom.window.getRes('about:assets/font.ttf'),
    'blob:cgb-font-1',
    'about: URLs emitted for about:srcdoc documents resolve through the manifest',
  );
  assert.equal(
    dom.window.getRes('about:srcdoc/assets/font.ttf'),
    'blob:cgb-font-1',
    'about:srcdoc-prefixed resource URLs resolve through the manifest',
  );

  const style = dom.window.document.createElement('style');
  style.textContent = '@font-face{font-family:CgbFixture;src:url("assets/font.ttf")}';
  dom.window.document.head.appendChild(style);
  assert.match(style.textContent, /url\("blob:cgb-font-\d+"\)/);
  assert.doesNotMatch(style.textContent, /assets\/font\.ttf/);
  dom.window.close();
});
