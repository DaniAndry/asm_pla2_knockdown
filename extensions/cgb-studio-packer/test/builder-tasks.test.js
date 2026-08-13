'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildTaskSettingsEqual,
  buildTaskConfigurationEqual,
  createBuilderOptions,
  createEstimateBuilderOptions,
  settingsFromBuilderTask,
} = require('../dist/builder-tasks');
const { createDefaultSettings } = require('../dist/settings');

function fixtureTask(overrides = {}) {
  return {
    id: '123',
    options: {
      platform: 'web-mobile',
      taskName: 'CGB - Main',
      name: 'fixture',
      buildPath: 'project://build',
      outputName: 'web-mobile',
      scenes: [{ url: 'db://assets/Main.scene', uuid: 'scene-1' }],
      startScene: 'scene-1',
      debug: false,
      sourceMaps: false,
      mangleProperties: false,
      md5Cache: false,
      skipCompressTexture: false,
      engineModulesConfigKey: 'default',
      nativeCodeBundleMode: 'asmjs',
      packages: {
        'web-mobile': {
          orientation: 'portrait',
          useWebGPU: false,
        },
      },
      ...overrides,
    },
  };
}

function settingsFor(task) {
  const imported = settingsFromBuilderTask(task);
  const settings = createDefaultSettings();
  settings.buildDefaults = {
    baseTaskId: task.id,
    name: imported.name,
    buildPath: imported.buildPath,
    outputName: imported.outputName,
    orientation: imported.orientation,
    engineModulesConfigKey: imported.engineModulesConfigKey,
    nativeCodeBundleMode: imported.nativeCodeBundleMode,
  };
  settings.variants[0] = {
    ...settings.variants[0],
    name: 'Main',
    nativeTaskId: task.id,
    scenes: imported.scenes,
    startScene: imported.startScene,
  };
  settings.activeVariantId = settings.variants[0].id;
  return settings;
}

test('unchanged native Builder task is reused and hidden flags are forced off', () => {
  const task = fixtureTask();
  const settings = settingsFor(task);
  const variant = settings.variants[0];
  assert.equal(buildTaskSettingsEqual(task, settings, variant), true);
  const options = createBuilderOptions(task, settings, variant, 'Main', undefined, true);
  assert.equal(options.taskId, '123');
  assert.equal(options.nativeCodeBundleMode, 'asmjs');
  assert.equal(options.engineModulesConfigKey, 'default');
  assert.equal(options.debug, false);
  assert.equal(options.sourceMaps, false);
  assert.equal(options.mangleProperties, false);
  assert.equal(options.md5Cache, false);
  assert.equal(options.skipCompressTexture, false);
  assert.equal(options.useWebGPU, false);
  assert.equal(options.packages['web-mobile'].useWebGPU, false);
  assert.equal(options.packages['cgb-studio-packer'].variationFolder, 'Main');
  assert.equal(options.packages['cgb-studio-packer'].variantId, variant.id);

  settings.createTargetSubfolders = false;
  variant.snapchat.cdnFolder = 'changed-after-task';
  variant.snapchat.configJson = '{"changed":true}';
  assert.equal(buildTaskSettingsEqual(task, settings, variant), true);
});

test('a task with removed release flags enabled is never reused', () => {
  const task = fixtureTask({
    debug: true,
    packages: {
      'web-mobile': {
        orientation: 'portrait',
        useWebGPU: true,
      },
    },
  });
  const settings = settingsFor(task);
  assert.equal(
    buildTaskSettingsEqual(task, settings, settings.variants[0]),
    false,
  );
});

test('changed common settings create a new native task while retaining native options', () => {
  const task = fixtureTask({ customNativeOption: 'preserved' });
  const settings = settingsFor(task);
  settings.buildDefaults.name = 'fixture-v2';
  const variant = settings.variants[0];
  assert.equal(buildTaskSettingsEqual(task, settings, variant), false);
  const options = createBuilderOptions(task, settings, variant, 'Main');
  assert.equal(options.taskId, undefined);
  assert.equal(options.name, 'fixture-v2');
  assert.equal(options.customNativeOption, 'preserved');
  assert.equal(options.taskName, 'CGB - Main');
});

test('task configuration reuse ignores scenes, start scene, variation name and packer-only settings', () => {
  const base = fixtureTask();
  const settings = settingsFor(base);
  const variant = settings.variants[0];
  const createdOptions = createBuilderOptions(base, settings, variant, 'Main');
  const linked = { id: '456', options: JSON.parse(JSON.stringify(createdOptions)) };

  variant.name = 'Renamed';
  variant.scenes = [{ url: 'db://assets/Other.scene', uuid: 'scene-2' }];
  variant.startScene = 'scene-2';
  settings.assetEncoding = 'base122';
  settings.networks.google = false;
  const desired = createBuilderOptions(linked, settings, variant, 'Renamed');
  assert.equal(buildTaskConfigurationEqual(linked, desired), true);

  settings.buildDefaults.orientation = 'landscape';
  const changed = createBuilderOptions(linked, settings, variant, 'Renamed');
  assert.equal(buildTaskConfigurationEqual(linked, changed), false);

  settings.buildDefaults.orientation = 'portrait';
  settings.buildDefaults.baseTaskId = 'another-base';
  const changedBase = createBuilderOptions(linked, settings, variant, 'Renamed');
  assert.equal(buildTaskConfigurationEqual(linked, changedBase), true);
});

test('task configuration reuse accepts package options hydrated from Creator profiles', () => {
  const base = fixtureTask();
  const settings = settingsFor(base);
  const variant = settings.variants[0];
  const desired = createBuilderOptions(base, settings, variant, 'Main');
  const persisted = JSON.parse(JSON.stringify(desired));
  assert.equal(buildTaskConfigurationEqual({ id: '456', options: persisted }, desired), true);
});

test('variant Splash override is deferred to the packer and does not change the native task', () => {
  const task = fixtureTask({
    useSplashScreen: true,
    splashScreen: {
      totalTime: 3456,
      autoFit: false,
      watermarkLocation: 'bottomRight',
    },
  });
  const settings = settingsFor(task);
  const variant = settings.variants[0];
  variant.splash.mode = 'override';
  const splash = {
    displayRatio: 1.5,
    totalTime: 3456,
    autoFit: false,
    watermarkLocation: 'bottomRight',
    logo: { type: 'none' },
    background: { type: 'default' },
  };
  const options = createBuilderOptions(task, settings, variant, 'Main', splash);
  assert.equal(options.useSplashScreen, true);
  assert.deepEqual(options.splashScreen, task.options.splashScreen);

  const linkedWithOldOverride = {
    id: '456',
    options: {
      ...JSON.parse(JSON.stringify(options)),
      useSplashScreen: true,
      splashScreen: splash,
    },
  };
  assert.equal(buildTaskConfigurationEqual(linkedWithOldOverride, options, true), true);
});

test('estimate task is isolated, temporary and keeps the real Builder options', () => {
  const task = fixtureTask({
    textureCompressConfig: { webp: true },
    modelCompressConfig: { enabled: true },
  });
  const settings = settingsFor(task);
  settings.buildDefaults.nativeCodeBundleMode = 'both';
  const variant = settings.variants[0];
  const options = createEstimateBuilderOptions(
    task,
    settings,
    variant,
    undefined,
    'project://build/.cgb-size-estimate-staging/run-1',
    'run-1',
  );

  assert.equal(options.taskId, undefined);
  assert.equal(options.taskName, 'CGB Estimate - Main');
  assert.equal(options.buildPath, 'project://build/.cgb-size-estimate-staging/run-1');
  assert.equal(options.outputName, 'web-mobile');
  assert.equal(options.engineModulesConfigKey, 'default');
  assert.equal(options.nativeCodeBundleMode, 'both');
  assert.deepEqual(options.textureCompressConfig, { webp: true });
  assert.deepEqual(options.modelCompressConfig, { enabled: true });
  assert.deepEqual(options.packages['cgb-studio-packer'], {
    estimateOnly: true,
    estimateRunId: 'run-1',
    variantId: variant.id,
  });
});
