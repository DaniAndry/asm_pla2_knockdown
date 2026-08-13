import { PACKAGE_NAME } from './constants';
import { normalizeBuildDefaults, normalizeScenes } from './settings';
import {
  BuildTaskSettings,
  BuildTaskSummary,
  BuildVariantSettings,
  CocosSplashSettings,
  PackerSettings,
} from './types';

export const EXTENSION_VERSION = '1.8.0';

export function cloneBuilderOptions(options: any): any {
  const clone = JSON.parse(JSON.stringify(options || {}));
  delete clone.logDest;
  delete clone.id;
  return clone;
}

export function settingsFromBuilderTask(task: any): BuildTaskSettings {
  const options = task?.rawOptions || task?.options || {};
  const webOptions = options?.packages?.['web-mobile'] || {};
  const common = normalizeBuildDefaults({
    baseTaskId: task?.id,
    name: options.name,
    buildPath: options.buildPath,
    outputName: options.outputName,
    orientation: webOptions.orientation,
    engineModulesConfigKey: options.engineModulesConfigKey,
    nativeCodeBundleMode: options.nativeCodeBundleMode,
  });
  const scenes = normalizeScenes(options.scenes);
  const startScene = typeof options.startScene === 'string'
    && scenes.some((scene) => scene.uuid === options.startScene)
    ? options.startScene
    : scenes[0]?.uuid || '';
  return {
    ...common,
    taskId: String(task?.id || ''),
    taskName: String(options.taskName || 'web-mobile'),
    scenes,
    startScene,
    useSplashScreen: options.useSplashScreen === true,
    ...(options.splashScreen && typeof options.splashScreen === 'object'
      ? { splashScreen: JSON.parse(JSON.stringify(options.splashScreen)) }
      : {}),
  };
}

export function summarizeBuilderTask(task: any): BuildTaskSummary {
  const settings = settingsFromBuilderTask(task);
  const label = [settings.taskName, settings.name].filter(Boolean).join(' - ') || String(task.id);
  return {
    id: String(task.id),
    label,
    settings,
  };
}

export function webMobileTasks(result: any): any[] {
  const list = Array.isArray(result?.list) ? result.list : [];
  return list
    .filter((task: any) => {
      const options = task?.rawOptions || task?.options;
      return options?.platform === 'web-mobile' && !options?.preview;
    })
    .sort((first: any, second: any) => Number(first.id || 0) - Number(second.id || 0));
}

export function selectBuilderTask(tasks: any[], preferredId?: string): any | undefined {
  if (preferredId) {
    const preferred = tasks.find((task) => String(task.id) === preferredId);
    if (preferred) return preferred;
  }
  return tasks[tasks.length - 1];
}

function comparableTask(value: BuildTaskSettings): any {
  return {
    taskName: value.taskName,
    name: value.name,
    buildPath: value.buildPath,
    outputName: value.outputName,
    orientation: value.orientation,
    engineModulesConfigKey: value.engineModulesConfigKey,
    nativeCodeBundleMode: value.nativeCodeBundleMode,
    scenes: value.scenes.map(({ url, uuid }) => ({ url, uuid })),
    startScene: value.startScene,
    useSplashScreen: value.useSplashScreen,
    splashScreen: value.useSplashScreen ? value.splashScreen || null : null,
  };
}

function desiredTaskSettings(
  settings: PackerSettings,
  variant: BuildVariantSettings,
  baseTask: any,
  splashScreen?: CocosSplashSettings,
): BuildTaskSettings {
  const base = settingsFromBuilderTask(baseTask || {});
  return {
    ...settings.buildDefaults,
    taskName: `CGB - ${variant.name}`,
    scenes: variant.scenes,
    startScene: variant.startScene,
    useSplashScreen: base.useSplashScreen,
    ...(base.splashScreen ? { splashScreen: base.splashScreen } : {}),
  };
}

export function buildTaskSettingsEqual(
  task: any,
  settings: PackerSettings,
  variant: BuildVariantSettings,
  splashScreen?: CocosSplashSettings,
): boolean {
  if (!task) return false;
  const options = task?.rawOptions || task?.options || {};
  if (
    options.debug === true
    || options.sourceMaps === true
    || options.mangleProperties === true
    || options.md5Cache === true
    || options.skipCompressTexture === true
    || options.useWebGPU === true
    || options.packages?.['web-mobile']?.useWebGPU === true
  ) {
    return false;
  }
  return JSON.stringify(comparableTask(settingsFromBuilderTask(task)))
    === JSON.stringify(comparableTask(desiredTaskSettings(
      settings,
      variant,
      task,
      splashScreen,
    )));
}

function comparableBuilderOptions(input: any, ignoreSplash: boolean): any {
  const options = cloneBuilderOptions(input);
  delete options.taskId;
  delete options.taskName;
  delete options.scenes;
  delete options.startScene;
  if (ignoreSplash) {
    delete options.useSplashScreen;
    delete options.splashScreen;
  }
  if (options.packages && typeof options.packages === 'object') {
    // The technical base task ID is not a build option. If the user selects an
    // equivalent duplicate native task, the effective cloned options below are
    // still identical and the linked CGB task can safely be reused.
    delete options.packages[PACKAGE_NAME];
  }
  return options;
}

/** Scene selection, start scene, variation name and packer snapshot are mutable
 * task inputs. Everything else belongs to the reusable native build config. */
export function buildTaskConfigurationEqual(
  task: any,
  desiredOptions: any,
  ignoreSplash = false,
): boolean {
  if (!task) return false;
  const actual = task?.rawOptions || task?.options || {};
  return JSON.stringify(comparableBuilderOptions(actual, ignoreSplash))
    === JSON.stringify(comparableBuilderOptions(desiredOptions, ignoreSplash));
}

export function createBuilderOptions(
  baseTask: any | undefined,
  settings: PackerSettings,
  variant: BuildVariantSettings,
  variationFolder: string,
  splashScreen?: CocosSplashSettings,
  reuseTask = false,
): any {
  const buildDefaults = normalizeBuildDefaults(settings.buildDefaults);
  if (!buildDefaults.name) throw new Error('Build game name is required.');
  if (!buildDefaults.engineModulesConfigKey) {
    throw new Error('Select a Feature Cropping configuration.');
  }
  if (!variant.scenes.length) {
    throw new Error(`Variation "${variant.name}" must include at least one scene.`);
  }
  if (!variant.scenes.some((scene) => scene.uuid === variant.startScene)) {
    throw new Error(`Variation "${variant.name}" must have a valid start scene.`);
  }

  const options = cloneBuilderOptions(baseTask?.rawOptions || baseTask?.options);
  options.platform = 'web-mobile';
  if (reuseTask && baseTask?.id) options.taskId = String(baseTask.id);
  else delete options.taskId;
  options.taskName = `CGB - ${variant.name}`;
  options.name = buildDefaults.name;
  options.buildPath = buildDefaults.buildPath;
  options.outputName = buildDefaults.outputName;
  options.scenes = variant.scenes.map(({ url, uuid }) => ({ url, uuid }));
  options.startScene = variant.startScene;
  options.engineModulesConfigKey = buildDefaults.engineModulesConfigKey;
  options.nativeCodeBundleMode = buildDefaults.nativeCodeBundleMode;

  // Playable builds always use release-safe defaults. These values deliberately
  // override a cloned native task so hidden flags cannot leak into a CGB build.
  options.debug = false;
  options.sourceMaps = false;
  options.mangleProperties = false;
  options.md5Cache = false;
  options.skipCompressTexture = false;
  options.useWebGPU = false;

  // A variation Splash is applied to the collected web-mobile settings during
  // packing. It is intentionally not sent to Builder: Creator 3.8 stores a
  // data URI in the task but does not reliably bake it into the output.

  options.packages = {
    ...(options.packages || {}),
    'web-mobile': {
      ...(options.packages?.['web-mobile'] || {}),
      orientation: buildDefaults.orientation,
      useWebGPU: false,
    },
    [PACKAGE_NAME]: {
      forcePack: true,
      settingsSnapshot: JSON.parse(JSON.stringify(settings)),
      variationFolder,
      variantId: variant.id,
    },
  };
  return options;
}

export function createEstimateBuilderOptions(
  baseTask: any | undefined,
  settings: PackerSettings,
  variant: BuildVariantSettings,
  splashScreen: CocosSplashSettings | undefined,
  buildPath: string,
  runId: string,
): any {
  const options = createBuilderOptions(
    baseTask,
    settings,
    variant,
    variant.name,
    splashScreen,
    false,
  );
  delete options.taskId;
  options.taskName = `CGB Estimate - ${variant.name}`;
  options.buildPath = buildPath;
  options.outputName = 'web-mobile';
  options.packages[PACKAGE_NAME] = {
    estimateOnly: true,
    estimateRunId: runId,
    variantId: variant.id,
  };
  return options;
}
