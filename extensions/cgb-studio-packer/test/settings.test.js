'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  createDefaultSettings,
  getSettingsPath,
  isProjectAssetScene,
  isValidSnapchatCdnFolder,
  loadSettings,
  normalizeScenes,
  normalizeSettings,
  parseSnapchatConfig,
  sanitizeVariationFolder,
  saveSettings,
  validateVariationFolders,
} = require('../dist/settings');
const { getEnabledProfiles } = require('../dist/networks/profiles');
const { NETWORK_IDS } = require('../dist/types');

test('schema v6 defaults enable every target, target folders and Snapchat settings', () => {
  const settings = createDefaultSettings();
  assert.equal(settings.assetEncoding, 'base64');
  assert.equal(settings.schemaVersion, 6);
  assert.equal(settings.obfuscate, true);
  assert.equal(settings.autoPackCocosBuilds, true);
  assert.equal(settings.createTargetSubfolders, true);
  assert.equal(settings.buildDefaults.buildPath, 'project://build');
  assert.equal(settings.buildDefaults.outputName, 'web-mobile');
  assert.equal(settings.buildDefaults.nativeCodeBundleMode, 'asmjs');
  assert.equal(settings.variants.length, 1);
  assert.equal(settings.activeVariantId, settings.variants[0].id);
  assert.equal(isValidSnapchatCdnFolder(settings.variants[0].snapchat.cdnFolder), true);
  assert.match(settings.variants[0].snapchat.cdnFolder, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(settings.variants[0].snapchat.configJson, '{}');
  for (const id of NETWORK_IDS) assert.equal(settings.networks[id], true);
});

test('settings persist and damaged JSON falls back to valid defaults', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-settings-'));
  const settings = createDefaultSettings();
  settings.assetEncoding = 'base122';
  settings.networks.google = false;
  saveSettings(directory, settings);
  saveSettings(directory, settings);
  assert.equal(loadSettings(directory).assetEncoding, 'base122');
  assert.equal(loadSettings(directory).networks.google, false);
  fs.writeFileSync(getSettingsPath(directory), '{broken', 'utf8');
  const recovered = loadSettings(directory);
  assert.equal(recovered.schemaVersion, 6);
  assert.equal(recovered.assetEncoding, 'base64');
  assert.equal(recovered.variants.length, 1);
  assert.equal(recovered.activeVariantId, recovered.variants[0].id);
});

test('schema v2 buildTask migrates to one v6 variation without losing task and scenes', () => {
  const settings = normalizeSettings({
    schemaVersion: 2,
    assetEncoding: 'base122',
    obfuscate: false,
    autoPackCocosBuilds: false,
    networks: { google: false },
    buildTask: {
      taskId: '42',
      name: 'fixture',
      buildPath: 'project://custom-build',
      outputName: 'playable',
      orientation: 'portrait',
      nativeCodeBundleMode: 'both',
      scenes: [
        { name: 'Main', url: 'db://assets/Main.scene', uuid: 'main' },
      ],
      startScene: 'main',
    },
  });
  assert.equal(settings.schemaVersion, 6);
  assert.equal(settings.assetEncoding, 'base122');
  assert.equal(settings.obfuscate, false);
  assert.equal(settings.networks.google, false);
  assert.equal(settings.buildDefaults.baseTaskId, '42');
  assert.equal(settings.buildDefaults.nativeCodeBundleMode, 'both');
  assert.equal(settings.variants.length, 1);
  assert.equal(settings.variants[0].name, 'Main');
  assert.equal(settings.variants[0].nativeTaskId, '42');
  assert.equal(settings.variants[0].startScene, 'main');
});

test('schema v3 migrates to v6 without changing variations', () => {
  const v3 = createDefaultSettings();
  v3.schemaVersion = 3;
  v3.variants[0] = {
    ...v3.variants[0],
    id: 'legacy-variant',
    name: 'Legacy variation',
    nativeTaskId: '77',
    scenes: [{ name: 'Main', url: 'db://assets/Main.scene', uuid: 'main' }],
    startScene: 'main',
  };
  v3.activeVariantId = 'legacy-variant';

  const settings = normalizeSettings(v3);
  assert.equal(settings.schemaVersion, 6);
  assert.equal(settings.variants.length, 1);
  assert.equal(settings.variants[0].id, 'legacy-variant');
  assert.equal(settings.variants[0].nativeTaskId, '77');
  assert.equal(settings.variants[0].startScene, 'main');
  assert.equal(settings.variants[0].sizeEstimate, undefined);
});

test('schema v6 preserves a valid saved estimate and normalizes damaged counters', () => {
  const source = createDefaultSettings();
  source.variants[0].sizeEstimate = {
    calculatedAt: '2026-07-31T10:00:00.000Z',
    fingerprint: 'abc123',
    sourceOutput: 'build/cgb-size-estimate/Main/web-mobile',
    base64Bytes: 4096,
    base122Bytes: 5000,
    categories: [{
      id: 'textures',
      label: 'Textures',
      rawBytes: 3000,
      compressedBytes: 2000,
      base64Bytes: 2600,
      base122Bytes: 3300,
    }],
  };
  const settings = normalizeSettings(source);
  assert.deepEqual(settings.variants[0].sizeEstimate, source.variants[0].sizeEstimate);

  source.variants[0].sizeEstimate.base64Bytes = -1;
  assert.equal(normalizeSettings(source).variants[0].sizeEstimate.base64Bytes, 0);
});

test('only real project Assets scenes are kept', () => {
  const scenes = normalizeScenes([
    { name: 'Main', url: 'db://assets/Main.scene', uuid: 'main' },
    {
      name: 'scene-2d',
      url: 'db://internal/default_file_content/scene/scene-2d.scene',
      uuid: 'scene-2d',
    },
    {
      name: 'scene-quality',
      url: 'db://internal/default_file_content/scene/scene-quality.scene',
      uuid: 'scene-quality',
    },
    {
      name: 'default',
      url: 'db://internal/default_file_content/scene/default.scene',
      uuid: 'default',
    },
  ]);
  assert.deepEqual(scenes, [
    { name: 'Main', url: 'db://assets/Main.scene', uuid: 'main' },
  ]);
  assert.equal(
    isProjectAssetScene({
      url: 'db://internal/default_file_content/scene/default.scene',
      uuid: 'default',
    }),
    false,
  );
});

test('variation folders are normalized and unique without regard to case', () => {
  assert.equal(sanitizeVariationFolder(' Promo: A. '), 'Promo- A');
  const settings = createDefaultSettings();
  settings.variants = [
    { ...settings.variants[0], id: 'a', name: 'Promo' },
    { ...settings.variants[0], id: 'b', name: 'promo' },
  ];
  assert.throws(() => validateVariationFolders(settings.variants), /same output folder/);
});

test('schema v4 migration enables new targets and creates a stable Snapchat folder', () => {
  const legacy = createDefaultSettings();
  legacy.schemaVersion = 4;
  delete legacy.createTargetSubfolders;
  delete legacy.variants[0].snapchat;
  delete legacy.networks.ironsource_dapi;
  delete legacy.networks.mraid_universal;
  delete legacy.networks.snapchat;
  delete legacy.networks.adcolony;

  const migrated = normalizeSettings(legacy);
  assert.equal(migrated.schemaVersion, 6);
  assert.equal(migrated.networks.default, true);
  assert.equal(migrated.createTargetSubfolders, true);
  assert.equal(migrated.networks.ironsource_dapi, true);
  assert.equal(migrated.networks.mraid_universal, true);
  assert.equal(migrated.networks.snapchat, true);
  assert.equal(migrated.networks.adcolony, true);
  assert.equal(isValidSnapchatCdnFolder(migrated.variants[0].snapchat.cdnFolder), true);
  assert.equal(
    normalizeSettings(migrated).variants[0].snapchat.cdnFolder,
    migrated.variants[0].snapchat.cdnFolder,
  );
});

test('Snapchat config preserves raw text and only accepts JSON objects', () => {
  const settings = createDefaultSettings();
  const variant = settings.variants[0];
  variant.name = 'Snap variation';
  variant.snapchat.configJson = '{\n  "custom": true\n}';
  const normalized = normalizeSettings(settings);
  assert.equal(normalized.variants[0].snapchat.configJson, variant.snapchat.configJson);
  assert.deepEqual(parseSnapchatConfig(normalized.variants[0]), { custom: true });
  normalized.variants[0].snapchat.configJson = '[1, 2]';
  assert.throws(() => parseSnapchatConfig(normalized.variants[0]), /Snap variation.*JSON object/);
  normalized.variants[0].snapchat.configJson = '{broken';
  assert.throws(() => parseSnapchatConfig(normalized.variants[0]), /Snap variation.*position/i);

  normalized.variants[0].snapchat.cdnFolder = '../unsafe';
  assert.equal(normalizeSettings(normalized).variants[0].snapchat.cdnFolder, '../unsafe');
});

test('network flags group variants and keep IronSource and Universal MRAID independent', () => {
  const settings = createDefaultSettings();
  for (const id of NETWORK_IDS) settings.networks[id] = false;
  settings.networks.google = true;
  settings.networks.ironsource = true;
  settings.networks.ironsource_dapi = true;
  settings.networks.mraid_universal = true;
  settings.networks.snapchat = true;
  settings.networks.adcolony = true;
  const profiles = getEnabledProfiles(settings);
  assert.deepEqual(
    profiles.filter((profile) => profile.networkId === 'google').map((profile) => profile.key),
    ['google', 'google_portrait', 'google_landscape'],
  );
  assert.deepEqual(
    profiles.filter((profile) => profile.networkId === 'ironsource').map((profile) => profile.key),
    ['ironsource'],
  );
  assert.deepEqual(
    profiles.filter((profile) => profile.networkId === 'ironsource_dapi').map((profile) => profile.key),
    ['ironsource_dapi'],
  );
  assert.deepEqual(
    profiles.filter((profile) => profile.networkId === 'mraid_universal').map((profile) => profile.key),
    ['mraid_universal'],
  );
  assert.deepEqual(
    profiles.filter((profile) => profile.networkId === 'snapchat').map((profile) => profile.key),
    ['snapchat', 'snapchat_cdn'],
  );
  assert.deepEqual(
    profiles.filter((profile) => profile.networkId === 'adcolony').map((profile) => profile.key),
    ['adcolony'],
  );

  settings.networks.ironsource = false;
  const dapiOnly = getEnabledProfiles(settings);
  assert.equal(dapiOnly.some((profile) => profile.key === 'ironsource'), false);
  assert.equal(dapiOnly.some((profile) => profile.key === 'ironsource_dapi'), true);
  assert.equal(dapiOnly.some((profile) => profile.key === 'mraid_universal'), true);
});
