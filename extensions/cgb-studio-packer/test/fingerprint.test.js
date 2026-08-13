'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createEstimateFingerprint } = require('../dist/estimate-fingerprint');
const { createDefaultSettings } = require('../dist/settings');

function projectFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-fingerprint-'));
  fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(root, 'build-templates', 'web-mobile'), { recursive: true });
  fs.mkdirSync(path.join(root, 'settings', 'v2', 'packages'), { recursive: true });
  fs.writeFileSync(path.join(root, 'assets', 'Main.scene'), 'scene-a');
  fs.writeFileSync(path.join(root, 'build-templates', 'web-mobile', 'index.ejs'), 'template-a');
  fs.writeFileSync(path.join(root, 'settings', 'v2', 'packages', 'engine.json'), '{"mode":"a"}');
  fs.writeFileSync(path.join(root, 'settings', 'v2', 'packages', 'builder.json'), '{"compression":true}');
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fixture"}');
  return root;
}

test('estimate fingerprint changes with relevant options, assets and templates', () => {
  const root = projectFixture();
  const settings = createDefaultSettings();
  const variant = settings.variants[0];
  variant.name = 'Main';
  variant.scenes = [{ name: 'Main', url: 'db://assets/Main.scene', uuid: 'main' }];
  variant.startScene = 'main';
  const options = {
    id: 'temporary-id',
    taskId: 'task-a',
    buildPath: 'project://temporary-a',
    outputName: 'web-mobile',
    engineModulesConfigKey: 'default',
    textureCompressConfig: { webp: true },
  };
  const first = createEstimateFingerprint(root, '3.8.8', options, settings, variant);
  const transientOnly = createEstimateFingerprint(root, '3.8.8', {
    ...options,
    id: 'another-id',
    taskId: 'another-task',
    buildPath: 'project://temporary-b',
  }, settings, variant);
  assert.equal(transientOnly, first);

  const irrelevantPackerSettings = createDefaultSettings();
  irrelevantPackerSettings.assetEncoding = 'base122';
  irrelevantPackerSettings.networks.google = false;
  irrelevantPackerSettings.createTargetSubfolders = false;
  irrelevantPackerSettings.variants[0] = {
    ...variant,
    selected: false,
    nativeTaskId: 'new-task',
    snapchat: { cdnFolder: 'changed-folder', configJson: '{"changed":true}' },
  };
  irrelevantPackerSettings.activeVariantId = variant.id;
  const irrelevantChanges = createEstimateFingerprint(
    root,
    '3.8.8',
    {
      ...options,
      packages: {
        'cgb-studio-packer': {
          settingsSnapshot: irrelevantPackerSettings,
          forcePack: true,
        },
      },
    },
    irrelevantPackerSettings,
    irrelevantPackerSettings.variants[0],
  );
  const matchingWithoutPackerPackage = createEstimateFingerprint(
    root,
    '3.8.8',
    options,
    settings,
    variant,
  );
  assert.equal(irrelevantChanges, matchingWithoutPackerPackage);

  fs.writeFileSync(
    path.join(root, 'settings', 'cgb-studio-packer.networks.js'),
    `module.exports={schemaVersion:1,adapters:{applovin:{script:{append:'network only'}}},profiles:{}};`,
  );
  const networkOverride = createEstimateFingerprint(root, '3.8.8', options, settings, variant);
  assert.equal(networkOverride, first);
  fs.writeFileSync(
    path.join(root, 'settings', 'cgb-studio-packer.networks.js'),
    `module.exports={schemaVersion:1,adapters:{},profiles:{default:{directory:'renamed',outputBaseName:'renamed'}}};`,
  );
  const defaultPathOnly = createEstimateFingerprint(root, '3.8.8', options, settings, variant);
  assert.equal(defaultPathOnly, first);
  fs.writeFileSync(
    path.join(root, 'settings', 'cgb-studio-packer.networks.js'),
    `module.exports={schemaVersion:1,adapters:{default:{script:{append:'default runtime'}}},profiles:{}};`,
  );
  const defaultOverride = createEstimateFingerprint(root, '3.8.8', options, settings, variant);
  assert.notEqual(defaultOverride, first);

  const changedOption = createEstimateFingerprint(root, '3.8.8', {
    ...options,
    textureCompressConfig: { webp: false },
  }, settings, variant);
  assert.notEqual(changedOption, first);

  fs.writeFileSync(path.join(root, 'assets', 'texture.webp'), 'new-asset');
  const changedAsset = createEstimateFingerprint(root, '3.8.8', options, settings, variant);
  assert.notEqual(changedAsset, first);

  fs.writeFileSync(path.join(root, 'build-templates', 'web-mobile', 'index.ejs'), 'longer-template-b');
  const changedTemplate = createEstimateFingerprint(root, '3.8.8', options, settings, variant);
  assert.notEqual(changedTemplate, changedAsset);
});
