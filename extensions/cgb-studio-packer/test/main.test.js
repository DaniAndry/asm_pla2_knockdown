'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createDefaultSettings, loadSettings } = require('../dist/settings');
const { createBuilderOptions } = require('../dist/builder-tasks');

function writeEstimateWebBuild(directory) {
  fs.mkdirSync(path.join(directory, 'src'), { recursive: true });
  fs.mkdirSync(path.join(directory, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.html'), `<!doctype html>
<html><head><title>Estimate integration</title></head><body>
<script src="src/project.js"></script></body></html>`);
  fs.writeFileSync(path.join(directory, 'src', 'project.js'), 'window.estimateIntegration=true;');
  fs.writeFileSync(path.join(directory, 'assets', 'texture.webp'), Buffer.alloc(256, 0x89));
}

test('project build URLs resolve to the real CGB output directory', () => {
  const previousEditor = global.Editor;
  const projectDirectory = path.resolve('C:/fixture/cocos-project');
  global.Editor = {
    Project: {
      path: projectDirectory,
    },
  };
  try {
    const { outputFromBuildOptions } = require('../dist/main');
    assert.equal(
      outputFromBuildOptions({
        buildPath: 'project://build',
        outputName: 'web-mobile',
      }),
      path.join(projectDirectory, 'build', 'cgb-playable-ready'),
    );
  } finally {
    global.Editor = previousEditor;
  }
});

test('Cocos Builder success code 36 is accepted and failure code 34 is rejected', () => {
  const { assertBuilderSuccess } = require('../dist/main');
  assert.doesNotThrow(() => assertBuilderSuccess(36));
  assert.doesNotThrow(() => assertBuilderSuccess(1));
  assert.throws(() => assertBuilderSuccess(34), /BUILD_FAILED.*34/);
});

test('version action creates developer overrides once and opens the configured Script Editor', async () => {
  const previousEditor = global.Editor;
  const previousElectronRunAsNode = process.env.ELECTRON_RUN_AS_NODE;
  const childProcess = require('node:child_process');
  const previousSpawn = childProcess.spawn;
  const projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-main-overrides-'));
  const fakeEditorPath = path.join(projectDirectory, 'Code.exe');
  fs.writeFileSync(fakeEditorPath, 'fixture');
  const calls = [];
  const spawnCalls = [];
  childProcess.spawn = (executable, args, options) => {
    spawnCalls.push({ executable, args, options });
    const child = new EventEmitter();
    child.unref = () => {};
    process.nextTick(() => child.emit('spawn'));
    return child;
  };
  process.env.ELECTRON_RUN_AS_NODE = '1';
  global.Editor = {
    Project: { path: projectDirectory },
    Message: {
      async request(target, message, ...args) {
        calls.push([target, message, ...args]);
        if (target === 'program' && message === 'query-program-info') {
          return { path: fakeEditorPath };
        }
        throw new Error(`Unexpected message ${target}:${message}`);
      },
    },
  };
  try {
    const { methods } = require('../dist/main');
    const first = await methods.openDeveloperOverrides();
    assert.equal(first.created, true);
    assert.equal(first.fallback, false);
    assert.ok(fs.existsSync(first.path));
    fs.writeFileSync(first.path, '// keep me', 'utf8');
    const second = await methods.openDeveloperOverrides();
    assert.equal(second.created, false);
    assert.equal(fs.readFileSync(second.path, 'utf8'), '// keep me');
    assert.equal(spawnCalls.length, 2);
    assert.equal(spawnCalls[0].executable, fakeEditorPath);
    assert.deepEqual(spawnCalls[0].args, ['--reuse-window', '--goto', `${first.path}:1:1`]);
    assert.equal(spawnCalls[0].options.cwd, path.dirname(first.path));
    assert.equal(spawnCalls[0].options.env.ELECTRON_RUN_AS_NODE, undefined);
    assert.equal(spawnCalls[0].options.detached, true);
    assert.equal(calls.some((call) => call[1] === 'open-program'), false);
  } finally {
    childProcess.spawn = previousSpawn;
    if (previousElectronRunAsNode === undefined) delete process.env.ELECTRON_RUN_AS_NODE;
    else process.env.ELECTRON_RUN_AS_NODE = previousElectronRunAsNode;
    global.Editor = previousEditor;
  }
});

test('AdsManager action creates the project module once without overwriting it', () => {
  const previousEditor = global.Editor;
  const projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-main-ads-manager-'));
  global.Editor = { Project: { path: projectDirectory } };
  try {
    const { methods } = require('../dist/main');
    const first = methods.installAdsManager();
    assert.equal(first.created, true);
    assert.equal(first.installed, true);
    assert.ok(first.path.endsWith(path.join('assets', 'Scripts', 'CGB', 'AdsManager.ts')));
    fs.writeFileSync(first.path, '// custom project manager', 'utf8');
    const second = methods.installAdsManager();
    assert.equal(second.created, false);
    assert.equal(fs.readFileSync(second.path, 'utf8'), '// custom project manager');
  } finally {
    global.Editor = previousEditor;
  }
});

test('selected variations build sequentially and queue continues after one failure', async () => {
  const previousEditor = global.Editor;
  const projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-main-queue-'));
  const sceneA = { name: 'A', url: 'db://assets/A.scene', uuid: 'scene-a' };
  const sceneB = { name: 'B', url: 'db://assets/B.scene', uuid: 'scene-b' };
  const settings = createDefaultSettings();
  settings.buildDefaults = {
    name: 'fixture',
    buildPath: 'project://build',
    outputName: 'web-mobile',
    orientation: 'portrait',
    engineModulesConfigKey: 'feature-default',
    nativeCodeBundleMode: 'both',
  };
  settings.variants = [
    {
      ...settings.variants[0],
      id: 'variant-a',
      name: 'A',
      scenes: [sceneA],
      startScene: sceneA.uuid,
    },
    {
      ...settings.variants[0],
      id: 'variant-b',
      name: 'B',
      scenes: [sceneB],
      startScene: sceneB.uuid,
    },
  ];
  settings.activeVariantId = 'variant-a';
  const addTaskOptions = [];
  const queryTaskOptions = [];

  global.Editor = {
    Project: { path: projectDirectory },
    Profile: {
      async getProject(namespace, key) {
        if (namespace === 'engine' && key === 'modules') {
          return {
            globalConfigKey: 'feature-default',
            configs: { 'feature-default': { name: 'Playable default' } },
          };
        }
        if (namespace === 'builder' && key === 'common') {
          return {
            splashScreen: {
              totalTime: 2000,
              autoFit: true,
              watermarkLocation: 'default',
            },
          };
        }
        return {};
      },
    },
    Message: {
      async request(target, message, ...args) {
        if (target === 'asset-db' && message === 'query-assets') return [sceneA, sceneB];
        if (target === 'builder' && message === 'query-tasks-info') {
          queryTaskOptions.push(args[0]);
          return { list: [] };
        }
        if (target === 'builder' && message === 'add-task') {
          addTaskOptions.push(args[0]);
          return addTaskOptions.length === 1 ? 34 : 36;
        }
        throw new Error(`Unexpected message ${target}:${message}`);
      },
    },
  };

  try {
    const { methods } = require('../dist/main');
    const result = await methods.build({
      settings,
      variantIds: ['variant-a', 'variant-b'],
    });
    assert.deepEqual(
      addTaskOptions.map((options) => options.taskName),
      ['CGB - A', 'CGB - B'],
    );
    assert.deepEqual(
      result.queue.items.map((item) => item.status),
      ['failure', 'success'],
    );
    for (const options of addTaskOptions) {
      assert.equal(options.engineModulesConfigKey, 'feature-default');
      assert.equal(options.nativeCodeBundleMode, 'both');
      assert.equal(options.debug, false);
      assert.equal(options.packages['web-mobile'].useWebGPU, false);
    }
    assert.equal(
      addTaskOptions[1].packages['cgb-studio-packer'].variationFolder,
      'B',
    );
    assert.equal(
      addTaskOptions[1].packages['cgb-studio-packer'].variantId,
      'variant-b',
    );
    assert.ok(queryTaskOptions.length > 0);
    assert.ok(queryTaskOptions.every((options) =>
      options.type === 'build' && !Object.prototype.hasOwnProperty.call(options, 'sortType')));
  } finally {
    global.Editor = previousEditor;
  }
});

test('invalid Snapchat variation stops the queue before creating a Builder task', async () => {
  const previousEditor = global.Editor;
  const projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-main-snap-'));
  const scene = { name: 'Main', url: 'db://assets/Main.scene', uuid: 'scene-main' };
  const settings = createDefaultSettings();
  settings.buildDefaults.name = 'fixture';
  settings.buildDefaults.engineModulesConfigKey = 'feature-default';
  settings.variants[0].name = 'Invalid Snap';
  settings.variants[0].scenes = [scene];
  settings.variants[0].startScene = scene.uuid;
  settings.variants[0].snapchat.configJson = '{broken';
  let addTaskCalls = 0;
  global.Editor = {
    Project: { path: projectDirectory },
    Profile: {
      async getProject(namespace, key) {
        if (namespace === 'engine' && key === 'modules') {
          return {
            globalConfigKey: 'feature-default',
            configs: { 'feature-default': { name: 'Playable default' } },
          };
        }
        if (namespace === 'builder' && key === 'common') return {};
        return {};
      },
    },
    Message: {
      async request(target, message) {
        if (target === 'asset-db' && message === 'query-assets') return [scene];
        if (target === 'builder' && message === 'query-tasks-info') return { list: [] };
        if (target === 'builder' && message === 'add-task') {
          addTaskCalls += 1;
          return 36;
        }
        throw new Error(`Unexpected message ${target}:${message}`);
      },
    },
  };
  try {
    const { methods } = require('../dist/main');
    await assert.rejects(
      () => methods.build({ settings, variantIds: [settings.variants[0].id] }),
      /Invalid Snap.*position/i,
    );
    assert.equal(addTaskCalls, 0);
  } finally {
    global.Editor = previousEditor;
  }
});

test('changing scenes, variation name and assets reuses the linked Builder task', async () => {
  const previousEditor = global.Editor;
  const projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-main-reuse-'));
  const sceneA = { name: 'A', url: 'db://assets/A.scene', uuid: 'scene-a' };
  const sceneB = { name: 'B', url: 'db://assets/B.scene', uuid: 'scene-b' };
  const settings = createDefaultSettings();
  settings.buildDefaults = {
    baseTaskId: 'linked',
    name: 'fixture',
    buildPath: 'project://build',
    outputName: 'web-mobile',
    orientation: 'portrait',
    engineModulesConfigKey: 'feature-default',
    nativeCodeBundleMode: 'asmjs',
  };
  const variant = settings.variants[0];
  variant.name = 'Original';
  variant.nativeTaskId = 'linked';
  variant.scenes = [sceneA];
  variant.startScene = sceneA.uuid;
  const initialOptions = createBuilderOptions(undefined, settings, variant, 'Original');
  let tasks = [{ id: 'linked', options: initialOptions }];
  const addTaskOptions = [];

  variant.name = 'Renamed';
  variant.scenes = [sceneB];
  variant.startScene = sceneB.uuid;
  fs.mkdirSync(path.join(projectDirectory, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(projectDirectory, 'assets', 'changed.bin'), 'changed');
  global.Editor = {
    Project: { path: projectDirectory },
    Profile: {
      async getProject(namespace, key) {
        if (namespace === 'engine' && key === 'modules') {
          return { globalConfigKey: 'feature-default', configs: { 'feature-default': { name: 'Default' } } };
        }
        return {};
      },
    },
    Message: {
      async request(target, message, ...args) {
        if (target === 'asset-db' && message === 'query-assets') return [sceneA, sceneB];
        if (target === 'builder' && message === 'query-tasks-info') return { list: tasks };
        if (target === 'builder' && message === 'add-task') {
          addTaskOptions.push(args[0]);
          tasks = [{ id: 'linked', options: args[0] }];
          return 36;
        }
        throw new Error(`Unexpected message ${target}:${message}`);
      },
    },
  };
  try {
    const { methods } = require('../dist/main');
    const result = await methods.build({ settings, variantIds: [variant.id] });
    assert.equal(result.queue.items[0].status, 'success');
    assert.equal(addTaskOptions.length, 1);
    assert.equal(addTaskOptions[0].taskId, 'linked');
    assert.equal(addTaskOptions[0].taskName, 'CGB - Renamed');
    assert.deepEqual(addTaskOptions[0].scenes, [{ url: sceneB.url, uuid: sceneB.uuid }]);
    assert.equal(tasks.length, 1);
    assert.equal(loadSettings(projectDirectory).variants[0].nativeTaskId, 'linked');
  } finally {
    global.Editor = previousEditor;
  }
});

test('size estimate uses a temporary task, publishes only diagnostic build and preserves it on failure', async () => {
  const previousEditor = global.Editor;
  const projectDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-main-estimate-'));
  const scene = { name: 'Main', url: 'db://assets/Main.scene', uuid: 'scene-main' };
  fs.mkdirSync(path.join(projectDirectory, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(projectDirectory, 'assets', 'Main.scene'), 'fixture scene');
  const settings = createDefaultSettings();
  settings.obfuscate = false;
  settings.buildDefaults = {
    baseTaskId: 'base-task',
    name: 'fixture',
    buildPath: 'project://build',
    outputName: 'web-mobile',
    orientation: 'portrait',
    engineModulesConfigKey: 'feature-default',
    nativeCodeBundleMode: 'both',
  };
  settings.variants[0] = {
    ...settings.variants[0],
    id: 'main-variant',
    name: 'Main variation',
    scenes: [scene],
    startScene: scene.uuid,
  };
  settings.activeVariantId = 'main-variant';

  const baseTask = {
    id: 'base-task',
    options: {
      platform: 'web-mobile',
      taskName: 'Existing web-mobile',
      name: 'fixture',
      buildPath: 'project://build',
      outputName: 'web-mobile',
      scenes: [{ url: scene.url, uuid: scene.uuid }],
      startScene: scene.uuid,
      engineModulesConfigKey: 'feature-default',
      nativeCodeBundleMode: 'both',
      textureCompressConfig: { webp: true },
      modelCompressConfig: { enabled: true },
      packages: { 'web-mobile': { orientation: 'portrait' } },
    },
  };
  let tasks = [baseTask];
  let failNextBuild = false;
  const addedOptions = [];
  const removedTasks = [];

  global.Editor = {
    Project: { path: projectDirectory },
    App: { version: '3.8.8' },
    Profile: {
      async getProject(namespace, key) {
        if (namespace === 'engine' && key === 'modules') {
          return {
            globalConfigKey: 'feature-default',
            configs: { 'feature-default': { name: 'Playable default' } },
          };
        }
        if (namespace === 'builder' && key === 'common') {
          return {
            splashScreen: { totalTime: 2000, autoFit: true },
          };
        }
        if (namespace === 'builder' && key === 'splash-setting') return undefined;
        return {};
      },
    },
    Message: {
      async request(target, message, ...args) {
        if (target === 'asset-db' && message === 'query-assets') return [scene];
        if (target === 'builder' && message === 'query-tasks-info') return { list: tasks };
        if (target === 'builder' && message === 'add-task') {
          const options = args[0];
          addedOptions.push(options);
          const task = { id: `estimate-${addedOptions.length}`, options };
          tasks = [...tasks, task];
          if (failNextBuild) return 34;
          const relativeBuildPath = options.buildPath.slice('project://'.length);
          writeEstimateWebBuild(path.join(projectDirectory, relativeBuildPath, options.outputName));
          return 36;
        }
        if (target === 'builder' && message === 'remove-task') {
          removedTasks.push(String(args[0]));
          tasks = tasks.filter((task) => String(task.id) !== String(args[0]));
          return true;
        }
        throw new Error(`Unexpected message ${target}:${message}`);
      },
    },
  };

  try {
    const { methods } = require('../dist/main');
    const result = await methods.estimateSize({ settings, variantId: 'main-variant' });
    const expectedOutput = path.join(
      projectDirectory,
      'build',
      'cgb-size-estimate',
      'Main variation',
      'web-mobile',
    );
    assert.equal(result.outputDirectory, expectedOutput);
    assert.ok(fs.existsSync(path.join(expectedOutput, 'index.html')));
    assert.equal(fs.existsSync(path.join(projectDirectory, 'build', 'cgb-playable-ready')), false);
    assert.ok(result.estimate.base64Bytes > 0);
    assert.ok(result.estimate.base122Bytes > 0);
    assert.equal(addedOptions[0].taskName, 'CGB Estimate - Main variation');
    assert.equal(addedOptions[0].taskId, undefined);
    assert.deepEqual(addedOptions[0].textureCompressConfig, { webp: true });
    assert.deepEqual(addedOptions[0].modelCompressConfig, { enabled: true });
    assert.equal(addedOptions[0].packages['cgb-studio-packer'].estimateOnly, true);
    assert.deepEqual(removedTasks, ['estimate-1']);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].id, 'base-task');
    assert.equal(
      fs.existsSync(path.join(projectDirectory, 'build', '.cgb-size-estimate-staging')),
      false,
    );
    assert.deepEqual(loadSettings(projectDirectory).variants[0].sizeEstimate, result.estimate);
    const freshState = await methods.getState();
    assert.equal(freshState.estimateStale['main-variant'], false);
    fs.writeFileSync(path.join(projectDirectory, 'assets', 'new-texture.webp'), 'changed assets');
    const changedState = await methods.getState();
    assert.equal(changedState.estimateStale['main-variant'], true);

    fs.writeFileSync(path.join(expectedOutput, 'preserved.txt'), 'previous diagnostic output');
    failNextBuild = true;
    await assert.rejects(
      () => methods.estimateSize({
        settings: loadSettings(projectDirectory),
        variantId: 'main-variant',
      }),
      /BUILD_FAILED.*34/,
    );
    assert.equal(
      fs.readFileSync(path.join(expectedOutput, 'preserved.txt'), 'utf8'),
      'previous diagnostic output',
    );
    assert.match(
      loadSettings(projectDirectory).variants[0].sizeEstimate.fingerprint,
      /^stale:/,
    );
    assert.deepEqual(removedTasks, ['estimate-1', 'estimate-2']);
    assert.equal(tasks.length, 1);
  } finally {
    global.Editor = previousEditor;
  }
});
