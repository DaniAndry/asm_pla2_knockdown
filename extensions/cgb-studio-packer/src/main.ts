import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as childProcess from 'child_process';
import { getAdsManagerPath, installAdsManager } from './ads-manager';
import {
  buildTaskSettingsEqual,
  buildTaskConfigurationEqual,
  createBuilderOptions,
  createEstimateBuilderOptions,
  EXTENSION_VERSION,
  selectBuilderTask,
  settingsFromBuilderTask,
  summarizeBuilderTask,
  webMobileTasks,
} from './builder-tasks';
import { DISPLAY_NAME, OUTPUT_DIRECTORY, PACKAGE_NAME } from './constants';
import {
  createEstimateFingerprint,
  createEstimateFingerprintEnvironment,
} from './estimate-fingerprint';
import { analyzeDefault } from './packer/estimate';
import { getOutputDirectory, packDirectory } from './packer/packer';
import {
  ensureDeveloperOverridesFile,
  getEffectiveProfiles,
  loadDeveloperOverrides,
} from './networks/dev-overrides';
import { OutputProfile } from './networks/profiles';
import {
  isProjectAssetScene,
  loadSettings,
  normalizeSettings,
  sanitizeVariationFolder,
  saveSettings as writeSettings,
  validateSnapchatSettings,
  validateVariationFolders,
} from './settings';
import {
  applySplashOverride,
  baseSplashSettings,
  copySplashAsset,
  resolveStoredSplashFile,
} from './splash';
import {
  BuildQueueState,
  BuildScene,
  BuildVariantSettings,
  EngineModuleConfigSummary,
  PanelState,
  PackerSettings,
  SizeEstimateState,
} from './types';

let busy = false;
let lastError = '';
let lastOutputDirectory = '';
let queue: BuildQueueState = {
  running: false,
  currentIndex: -1,
  total: 0,
  items: [],
};
let estimateState: SizeEstimateState = { running: false };
let cachedEstimateStale: Record<string, boolean> = {};

function projectPath(): string {
  return Editor.Project?.path || Editor.projectPath || process.cwd();
}

function creatorVersion(): string {
  return String(Editor.App?.version || Editor.version || 'unknown');
}

export function projectPackageName(projectDirectory: string): string {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(projectDirectory, 'package.json'), 'utf8'));
    return typeof packageJson?.name === 'string' ? packageJson.name.trim() : '';
  } catch (_error) {
    return '';
  }
}

export function outputFromBuildOptions(options: any, variationFolder?: string): string {
  if (!options?.buildPath) return '';
  const buildPath = String(options.buildPath).startsWith('project://')
    ? path.resolve(
      projectPath(),
      String(options.buildPath).slice('project://'.length).replace(/^[/\\]+/, ''),
    )
    : path.resolve(options.buildPath);
  const buildDirectory = options.outputName
    ? path.join(buildPath, options.outputName)
    : buildPath;
  const root = path.join(path.dirname(buildDirectory), OUTPUT_DIRECTORY);
  return variationFolder ? path.join(root, sanitizeVariationFolder(variationFolder)) : root;
}

export function assertBuilderSuccess(result: unknown): void {
  // Cocos Creator 3.8 returns BuildExitCode.BUILD_SUCCESS (36) when shouldWait is true.
  // TaskAddResult.SUCCESS (1) is accepted for compatibility with non-waiting implementations.
  if (result === 36 || result === 1) return;
  const names: Record<number, string> = {
    0: 'BUILD_BUSY',
    2: 'PARAM_ERROR',
    32: 'PARAM_ERROR',
    34: 'BUILD_FAILED',
    37: 'BUILD_BUSY',
    50: 'UNKNOWN_ERROR',
  };
  const code = typeof result === 'number' ? result : NaN;
  const label = names[code] || 'UNEXPECTED_RESULT';
  throw new Error(`Cocos Builder returned ${label} (code ${String(result)}).`);
}

function persistedTaskPackageOptions(packageName: string, taskId: string): unknown {
  const profilePath = path.join(
    projectPath(),
    'profiles',
    'v2',
    'packages',
    `${packageName}.json`,
  );
  try {
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    return profile?.builder?.taskOptionsMap?.[taskId];
  } catch (_error) {
    return undefined;
  }
}

async function queryWebMobileTasks(): Promise<any[]> {
  try {
    const result = await Editor.Message.request('builder', 'query-tasks-info', {
      type: 'build',
    });
    const tasks = webMobileTasks(result);
    // Creator stores package-specific task options outside Builder's task
    // object. Hydrate them before comparing configs; otherwise every task has
    // packages: {} and is incorrectly treated as changed.
    await Promise.all(tasks.map(async (task) => {
      const id = String(task.id);
      const options = task?.rawOptions || task?.options;
      if (!options) return;
      const packages: Record<string, unknown> = {};
      for (const packageName of ['web-mobile', PACKAGE_NAME]) {
        let value: unknown;
        try {
          value = await Editor.Profile.getProject(
            packageName,
            `builder.taskOptionsMap.${id}`,
          );
        } catch (_error) {}
        if (!value || typeof value !== 'object' || !Object.keys(value).length) {
          value = persistedTaskPackageOptions(packageName, id);
        }
        if (
          value
          && typeof value === 'object'
          && Object.keys(value as Record<string, unknown>).length
        ) {
          packages[packageName] = value;
        }
      }
      options.packages = { ...(options.packages || {}), ...packages };
    }));
    return tasks;
  } catch (error) {
    console.warn('[CGB Studio packer] Could not query web-mobile build tasks.', error);
    return [];
  }
}

async function queryBuilderCommonOptions(): Promise<any> {
  let common: any = {};
  let splashScreen: any;
  try {
    common = await Editor.Profile.getProject('builder', 'common') || {};
  } catch (error) {
    console.warn('[CGB Studio packer] Could not query Builder defaults.', error);
  }
  try {
    splashScreen = await Editor.Profile.getProject('builder', 'splash-setting');
  } catch (error) {
    console.warn('[CGB Studio packer] Could not query Splash settings.', error);
  }
  return {
    ...(common && typeof common === 'object' ? common : {}),
    ...(splashScreen && typeof splashScreen === 'object'
      ? { splashScreen }
      : {}),
  };
}

async function queryEngineModuleConfigs(): Promise<{
  configs: EngineModuleConfigSummary[];
  defaultKey: string;
}> {
  try {
    const profile = await Editor.Profile.getProject('engine', 'modules') || {};
    const source = profile.configs || profile.modules?.configs || {};
    const configs = Object.entries(source)
      .map(([key, value]: [string, any]) => ({
        key,
        label: String(value?.name || key),
      }))
      .sort((first, second) => first.label.localeCompare(second.label));
    const requestedDefault = String(profile.globalConfigKey || profile.modules?.globalConfigKey || '');
    const defaultKey = configs.some((config) => config.key === requestedDefault)
      ? requestedDefault
      : configs[0]?.key || '';
    return { configs, defaultKey };
  } catch (error) {
    console.warn('[CGB Studio packer] Could not query Feature Cropping configurations.', error);
    return { configs: [], defaultKey: '' };
  }
}

async function queryProjectScenes(): Promise<BuildScene[]> {
  try {
    const assets = await Editor.Message.request(
      'asset-db',
      'query-assets',
      { extname: '.scene' },
      ['name', 'url', 'uuid'],
    );
    if (!Array.isArray(assets)) return [];
    return assets
      .filter(isProjectAssetScene)
      .map((asset: any) => ({
        name: String(asset.name || path.basename(asset.url, '.scene')),
        url: String(asset.url),
        uuid: String(asset.uuid),
      }))
      .sort((first: BuildScene, second: BuildScene) =>
        String(first.name || first.url).localeCompare(String(second.name || second.url)));
  } catch (error) {
    console.warn('[CGB Studio packer] Could not query project scenes.', error);
    return [];
  }
}

function setBusy(value: boolean): void {
  busy = value;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.stack || error.message : String(error);
}

function recordError(error: unknown): never {
  lastError = errorText(error);
  console.error(`[${DISPLAY_NAME}]`, error);
  throw error;
}

function currentOutputDirectory(settings: PackerSettings): string {
  if (lastOutputDirectory) return lastOutputDirectory;
  if (settings.lastManualInput) return getOutputDirectory(settings.lastManualInput);
  return path.join(projectPath(), 'build', OUTPUT_DIRECTORY);
}

async function selectPath(options: any): Promise<string | undefined> {
  const result = await Editor.Dialog.select(options);
  if (Array.isArray(result)) return result[0];
  if (result?.canceled) return undefined;
  if (Array.isArray(result?.filePaths)) return result.filePaths[0];
  return typeof result === 'string' ? result : undefined;
}

async function selectDirectory(): Promise<string | undefined> {
  return selectPath({
    title: 'Select an existing Cocos web-mobile build',
    properties: ['openDirectory'],
  });
}

async function openPath(target: string): Promise<void> {
  if (!target || !fs.existsSync(target)) {
    throw new Error(`Path does not exist: ${target || '(empty)'}`);
  }
  const electron = require('electron');
  const error = await electron.shell.openPath(target);
  if (error) throw new Error(error);
}

function scriptEditorArguments(
  executable: string,
  commandArgument: unknown,
  filePath: string,
): string[] {
  const source = Array.isArray(commandArgument)
    ? commandArgument.map(String)
    : String(commandArgument || '').match(/"[^"]*"|'[^']*'|[^\s]+/g) || [];
  if (!source.length && /^code(?: - insiders)?\.exe$/i.test(path.basename(executable))) {
    return ['--reuse-window', '--goto', `${filePath}:1:1`];
  }
  let containsFilePlaceholder = false;
  const args = source.map((argument) => {
    const unquoted = argument.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_match, double, single) =>
      double === undefined ? single : double);
    return unquoted.replace(/\{\{?(?:file|path)\}?\}|\$\{(?:file|path)\}|%(?:file|path)%/gi, () => {
      containsFilePlaceholder = true;
      return filePath;
    });
  });
  if (!containsFilePlaceholder) args.push(filePath);
  return args;
}

function launchConfiguredScriptEditor(configured: any, filePath: string): boolean {
  const executable = String(configured?.path || '');
  if (!executable || !fs.existsSync(executable)) return false;
  const args = scriptEditorArguments(executable, configured.commandArgument, filePath);
  try {
    const environment = { ...process.env };
    // Creator itself is an Electron application. Passing its Node/Electron flags
    // to another Electron application can make Code.exe start as a headless Node
    // process instead of opening the requested editor tab.
    delete environment.ELECTRON_RUN_AS_NODE;
    delete environment.NODE_OPTIONS;
    const child = childProcess.spawn(executable, args, {
      cwd: path.dirname(filePath),
      detached: true,
      env: environment,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', (error) => {
      console.warn('[CGB Studio packer] Script Editor process failed after launch.', error);
    });
    child.unref();
    return true;
  } catch (_error) {
    return false;
  }
}

export function findPreviewHtml(
  outputDirectory: string,
  settings: PackerSettings,
  variant: BuildVariantSettings,
  effectiveProfiles: OutputProfile[],
): string | undefined {
  const variationDirectory = path.join(outputDirectory, sanitizeVariationFolder(variant.name));
  if (!fs.existsSync(variationDirectory)) return undefined;
  const profiles = effectiveProfiles.filter((profile) =>
    !profile.zip && profile.networkId && settings.networks[profile.networkId]);
  const ordered = [
    ...profiles.filter((profile) => profile.key === 'default'),
    ...profiles.filter((profile) => profile.key !== 'default'),
  ];
  for (const profile of ordered) {
    const directory = settings.createTargetSubfolders
      ? path.join(variationDirectory, profile.directory)
      : variationDirectory;
    if (!fs.existsSync(directory)) continue;
    const suffix = `%${profile.outputBaseName}.html`.toLowerCase();
    const candidates = fs.readdirSync(directory)
      .filter((file) => file.toLowerCase().endsWith(suffix))
      .map((file) => ({ file: path.join(directory, file), modified: fs.statSync(path.join(directory, file)).mtimeMs }))
      .sort((first, second) => second.modified - first.modified);
    if (candidates[0]) return candidates[0].file;
  }
  return undefined;
}

function previewHtml(settings: PackerSettings, variant: BuildVariantSettings): string | undefined {
  const overrides = loadDeveloperOverrides(projectPath());
  return findPreviewHtml(
    currentOutputDirectory(settings),
    settings,
    variant,
    getEffectiveProfiles(overrides),
  );
}

function canPreview(settings: PackerSettings, variant: BuildVariantSettings | undefined): boolean {
  if (!variant) return false;
  try {
    return Boolean(previewHtml(settings, variant));
  } catch (error) {
    console.warn('[CGB Studio packer] Could not resolve Preview output.', error);
    return false;
  }
}

async function openDeveloperOverrides(): Promise<{
  path: string;
  outputDirectory: string;
  created: boolean;
  fallback: boolean;
  warning?: string;
}> {
  const result = ensureDeveloperOverridesFile(projectPath());
  let opened = false;
  try {
    const configured = await Editor.Message.request('program', 'query-program-info', 'scriptEditor');
    opened = launchConfiguredScriptEditor(configured, result.path);
  } catch (error) {
    console.warn('[CGB Studio packer] Default Script Editor could not open overrides.', error);
  }
  if (!opened) {
    const electron = require('electron');
    electron.clipboard.writeText(result.path);
    electron.shell.showItemInFolder(result.path);
  }
  return {
    ...result,
    outputDirectory: result.path,
    fallback: !opened,
    ...(!opened ? { warning: 'Default Script Editor is not configured or could not open the file. The path was copied and revealed in Explorer.' } : {}),
  };
}

function taskOptions(task: any): any {
  return task?.rawOptions || task?.options || {};
}

function findVariant(settings: PackerSettings, variantId?: string): BuildVariantSettings {
  const id = variantId || settings.activeVariantId;
  const variant = settings.variants.find((item) => item.id === id);
  if (!variant) throw new Error('Select a valid CGB variation.');
  return variant;
}

function validateVariantSplash(variant: BuildVariantSettings): void {
  if (variant.splash.mode !== 'override') return;
  if (variant.splash.logo.type === 'custom') {
    resolveStoredSplashFile(projectPath(), variant.splash.logo.file || '');
  }
  if (variant.splash.background.type === 'custom') {
    resolveStoredSplashFile(projectPath(), variant.splash.background.file || '');
  }
}

function initializeFromBaseTask(
  settings: PackerSettings,
  tasks: any[],
): PackerSettings {
  const selected = selectBuilderTask(tasks, settings.buildDefaults.baseTaskId);
  if (!selected) return settings;
  const imported = settingsFromBuilderTask(selected);
  if (!settings.buildDefaults.baseTaskId) {
    settings.buildDefaults.baseTaskId = String(selected.id);
  }
  if (!settings.buildDefaults.name) {
    settings.buildDefaults = {
      baseTaskId: String(selected.id),
      name: imported.name,
      buildPath: imported.buildPath,
      outputName: imported.outputName,
      orientation: imported.orientation,
      engineModulesConfigKey: imported.engineModulesConfigKey,
      nativeCodeBundleMode: imported.nativeCodeBundleMode,
    };
    const first = settings.variants[0];
    if (first && !first.scenes.length && imported.scenes.length) {
      first.scenes = imported.scenes;
      first.startScene = imported.startScene;
      first.nativeTaskId = String(selected.id);
      if (/^Variation \d+$/i.test(first.name)) {
        const start = first.scenes.find((scene) => scene.uuid === first.startScene);
        first.name = String(start?.name || path.basename(start?.url || '', '.scene'))
          .replace(/\.scene$/i, '') || first.name;
      }
    }
  }
  return settings;
}

function initializeGameNameFromProject(settings: PackerSettings): PackerSettings {
  if (settings.buildDefaults.name.trim()) return settings;
  const name = projectPackageName(projectPath());
  if (name) settings.buildDefaults.name = name;
  return settings;
}

function queueSnapshot(): BuildQueueState {
  return JSON.parse(JSON.stringify(queue));
}

function splashPreviews(settings: PackerSettings): PanelState['splashPreviews'] {
  const previews: PanelState['splashPreviews'] = {};
  const add = (
    variant: BuildVariantSettings,
    kind: 'logo' | 'background',
    storedPath: string | undefined,
  ): void => {
    if (!storedPath) return;
    try {
      const absolute = resolveStoredSplashFile(projectPath(), storedPath);
      const mime = path.extname(absolute).toLowerCase() === '.png'
        ? 'image/png'
        : 'image/jpeg';
      const value = `data:${mime};base64,${fs.readFileSync(absolute).toString('base64')}`;
      previews[variant.id] = {
        ...(previews[variant.id] || {}),
        [kind]: value,
      };
    } catch (error) {
      console.warn(`[CGB Studio packer] Could not preview ${storedPath}.`, error);
    }
  };
  for (const variant of settings.variants) {
    add(variant, 'logo', variant.splash.logo.file);
    add(variant, 'background', variant.splash.background.file);
  }
  return previews;
}

function setQueue(settings: PackerSettings, variants: BuildVariantSettings[]): void {
  queue = {
    running: true,
    currentIndex: -1,
    total: variants.length,
    items: variants.map((variant) => ({
      variantId: variant.id,
      name: variant.name,
      status: 'pending',
    })),
  };
  lastError = '';
  lastOutputDirectory = currentOutputDirectory(settings);
}

async function resolveNewTask(
  before: any[],
  settings: PackerSettings,
  variant: BuildVariantSettings,
  splashScreen: any,
): Promise<{ tasks: any[]; task?: any }> {
  const updated = await queryWebMobileTasks();
  const previousIds = new Set(before.map((task) => String(task.id)));
  const matching = updated.filter((task) =>
    buildTaskSettingsEqual(task, settings, variant, splashScreen));
  const created = matching.find((task) => !previousIds.has(String(task.id)));
  return { tasks: updated, task: created || matching[matching.length - 1] };
}

function baseTaskForVariant(
  settings: PackerSettings,
  variant: BuildVariantSettings,
  tasks: any[],
  builderDefaults: any,
): any {
  const linked = tasks.find((task) => String(task.id) === variant.nativeTaskId);
  const requested = selectBuilderTask(tasks, settings.buildDefaults.baseTaskId);
  if (!linked) return requested || { options: builderDefaults };
  const previousBaseTaskId = taskOptions(linked)
    ?.packages?.[PACKAGE_NAME]?.settingsSnapshot?.buildDefaults?.baseTaskId;
  if (previousBaseTaskId && String(previousBaseTaskId) !== String(settings.buildDefaults.baseTaskId || '')) {
    return requested || linked;
  }
  if (!previousBaseTaskId && requested && String(requested.id) !== String(linked.id)) {
    return requested;
  }
  return linked;
}

function buildContext(
  settings: PackerSettings,
  variant: BuildVariantSettings,
  tasks: any[],
  builderDefaults: any,
): { baseTask: any; splashScreen: any; fingerprintOptions: any } {
  const baseTask = baseTaskForVariant(settings, variant, tasks, builderDefaults);
  const inheritedSplash = baseSplashSettings(
    builderDefaults?.splashScreen,
    taskOptions(baseTask)?.splashScreen,
  );
  const splashScreen = applySplashOverride(projectPath(), inheritedSplash, variant.splash);
  const fingerprintOptions = createBuilderOptions(
    baseTask,
    settings,
    variant,
    sanitizeVariationFolder(variant.name),
    splashScreen,
    false,
  );
  return { baseTask, splashScreen, fingerprintOptions };
}

function validateVariant(
  variant: BuildVariantSettings,
  projectScenes: BuildScene[],
): void {
  if (!variant.scenes.length) {
    throw new Error(`Variation "${variant.name}" has no scenes.`);
  }
  const availableSceneIds = new Set(projectScenes.map((scene) => scene.uuid));
  const missingScenes = variant.scenes.filter((scene) => !availableSceneIds.has(scene.uuid));
  if (missingScenes.length) {
    throw new Error(
      `Variation "${variant.name}" contains scenes that do not exist in Assets: `
      + missingScenes.map((scene) => scene.name || scene.url).join(', '),
    );
  }
  if (!variant.scenes.some((scene) => scene.uuid === variant.startScene)) {
    throw new Error(`Variation "${variant.name}" has an invalid start scene.`);
  }
  validateVariantSplash(variant);
}

function estimateOutputRelative(variant: BuildVariantSettings): string {
  return path.posix.join(
    'build',
    'cgb-size-estimate',
    sanitizeVariationFolder(variant.name),
    'web-mobile',
  );
}

async function renameWithRetry(source: string, destination: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (true) {
    try {
      fs.renameSync(source, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(String(code)) || Date.now() >= deadline) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
}

async function replaceDiagnosticOutput(source: string, destination: string): Promise<void> {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const backup = `${destination}.cgb-backup-${process.pid}-${Date.now()}`;
  let backedUp = false;
  try {
    if (fs.existsSync(destination)) {
      await renameWithRetry(destination, backup);
      backedUp = true;
    }
    await renameWithRetry(source, destination);
    fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true, force: true });
    if (backedUp && fs.existsSync(backup)) await renameWithRetry(backup, destination);
    throw error;
  }
}

async function findEstimateTask(beforeIds: Set<string>, runId: string): Promise<any | undefined> {
  const tasks = await queryWebMobileTasks();
  return tasks.find((task) => {
    if (beforeIds.has(String(task.id))) return false;
    const options = taskOptions(task);
    return options?.packages?.[PACKAGE_NAME]?.estimateRunId === runId
      || String(options?.taskName || '').startsWith('CGB Estimate - ');
  });
}

async function removeEstimateTask(taskId: string): Promise<void> {
  await Editor.Message.request('builder', 'remove-task', taskId);
}

function markEstimateStale(settings: PackerSettings, variantId: string): void {
  const variant = settings.variants.find((item) => item.id === variantId);
  if (!variant?.sizeEstimate || variant.sizeEstimate.fingerprint.startsWith('stale:')) return;
  variant.sizeEstimate.fingerprint = `stale:${variant.sizeEstimate.fingerprint}`;
  writeSettings(projectPath(), settings);
}

function estimateRelevantValue(settings: PackerSettings, variant: BuildVariantSettings): string {
  const { baseTaskId: _baseTaskId, ...buildDefaults } = settings.buildDefaults;
  return JSON.stringify({
    buildDefaults,
    obfuscate: settings.obfuscate,
    variant: {
      id: variant.id,
      name: variant.name,
      scenes: variant.scenes,
      startScene: variant.startScene,
      splash: variant.splash,
    },
  });
}

function estimateStaleState(
  settings: PackerSettings,
  tasks: any[],
  builderDefaults: any,
): Record<string, boolean> {
  const output: Record<string, boolean> = {};
  const candidates = settings.variants.filter((variant) => variant.sizeEstimate);
  if (!candidates.length) return output;
  const environment = createEstimateFingerprintEnvironment(projectPath(), creatorVersion());
  for (const variant of candidates) {
    const estimate = variant.sizeEstimate!;
    try {
      const { fingerprintOptions } = buildContext(settings, variant, tasks, builderDefaults);
      const current = createEstimateFingerprint(
        projectPath(),
        creatorVersion(),
        fingerprintOptions,
        settings,
        variant,
        environment,
      );
      const sourceOutput = path.resolve(projectPath(), estimate.sourceOutput);
      output[variant.id] = estimate.fingerprint !== current || !fs.existsSync(sourceOutput);
    } catch (error) {
      output[variant.id] = true;
    }
  }
  return output;
}

export const methods = {
  async openPanel(): Promise<void> {
    await Editor.Panel.open(PACKAGE_NAME);
  },

  async getState(): Promise<PanelState> {
    let settings = loadSettings(projectPath());
    const [tasks, projectScenes, engine, builderDefaults] = await Promise.all([
      queryWebMobileTasks(),
      queryProjectScenes(),
      queryEngineModuleConfigs(),
      queryBuilderCommonOptions(),
    ]);
    settings = initializeFromBaseTask(settings, tasks);
    settings = initializeGameNameFromProject(settings);
    if (!settings.buildDefaults.engineModulesConfigKey) {
      const base = selectBuilderTask(tasks, settings.buildDefaults.baseTaskId);
      const baseKey = base ? settingsFromBuilderTask(base).engineModulesConfigKey : '';
      settings.buildDefaults.engineModulesConfigKey = baseKey || engine.defaultKey;
    }
    if (!busy) {
      cachedEstimateStale = estimateStaleState(settings, tasks, builderDefaults);
    }
    const activeVariant = settings.variants.find((variant) => variant.id === settings.activeVariantId)
      || settings.variants[0];
    return {
      version: EXTENSION_VERSION,
      settings,
      buildTasks: tasks.map(summarizeBuilderTask),
      projectScenes,
      engineModuleConfigs: engine.configs,
      outputDirectory: currentOutputDirectory(settings),
      lastError,
      busy,
      queue: queueSnapshot(),
      splashPreviews: splashPreviews(settings),
      estimateState: { ...estimateState },
      estimateStale: { ...cachedEstimateStale },
      previewAvailable: canPreview(settings, activeVariant),
      adsManager: {
        path: getAdsManagerPath(projectPath()),
        installed: fs.existsSync(getAdsManagerPath(projectPath())),
      },
    };
  },

  saveSettings(input: unknown): PackerSettings {
    lastError = '';
    const previous = loadSettings(projectPath());
    const saved = writeSettings(projectPath(), input);
    for (const variant of saved.variants) {
      if (!variant.sizeEstimate) continue;
      const old = previous.variants.find((item) => item.id === variant.id);
      if (!old || estimateRelevantValue(previous, old) !== estimateRelevantValue(saved, variant)) {
        cachedEstimateStale[variant.id] = true;
      }
    }
    return saved;
  },

  async build(input: unknown): Promise<{
    outputDirectory: string;
    queue: BuildQueueState;
  }> {
    if (busy) throw new Error('CGB Studio packer is already running.');
    setBusy(true);
    try {
      const payload = input && typeof input === 'object' ? input as any : {};
      let settings = normalizeSettings(payload.settings || input);
      loadDeveloperOverrides(projectPath());
      validateVariationFolders(settings.variants);
      const requestedIds = Array.isArray(payload.variantIds)
        ? new Set(payload.variantIds.map(String))
        : new Set(settings.variants.filter((variant) => variant.selected).map((variant) => variant.id));
      const variants = settings.variants.filter((variant) => requestedIds.has(variant.id));
      if (!variants.length) throw new Error('Select at least one CGB variation to build.');

      const [engine, builderDefaults, projectScenes] = await Promise.all([
        queryEngineModuleConfigs(),
        queryBuilderCommonOptions(),
        queryProjectScenes(),
      ]);
      if (!engine.configs.some((config) => config.key === settings.buildDefaults.engineModulesConfigKey)) {
        throw new Error('The selected Feature Cropping configuration does not exist.');
      }
      for (const variant of variants) {
        validateVariant(variant, projectScenes);
        if (settings.networks.snapchat) validateSnapchatSettings(variant);
      }

      settings = writeSettings(projectPath(), settings);
      setQueue(settings, variants);
      let tasks = await queryWebMobileTasks();

      for (let index = 0; index < variants.length; index += 1) {
        const variant = settings.variants.find((item) => item.id === variants[index].id)!;
        queue.currentIndex = index;
        const item = queue.items[index];
        item.status = 'building';
        try {
          const linked = tasks.find((task) => String(task.id) === variant.nativeTaskId);
          const baseTask = baseTaskForVariant(settings, variant, tasks, builderDefaults);
          const inheritedSplash = baseSplashSettings(
            builderDefaults?.splashScreen,
            taskOptions(baseTask)?.splashScreen,
          );
          const splashScreen = applySplashOverride(
            projectPath(),
            inheritedSplash,
            variant.splash,
          );
          const variationFolder = sanitizeVariationFolder(variant.name);
          const options = createBuilderOptions(
            baseTask,
            settings,
            variant,
            variationFolder,
            splashScreen,
            false,
          );
          const reuseTask = Boolean(linked)
            && buildTaskConfigurationEqual(
              linked,
              options,
              variant.splash.mode === 'override',
            );
          if (reuseTask) options.taskId = String(linked.id);
          const expectedOutput = outputFromBuildOptions(options, variationFolder);
          const before = tasks;
          const result = await Editor.Message.request('builder', 'add-task', options, true);
          assertBuilderSuccess(result);
          if (reuseTask) {
            tasks = await queryWebMobileTasks();
          } else {
            const resolved = await resolveNewTask(before, settings, variant, splashScreen);
            tasks = resolved.tasks;
            if (resolved.task) {
              variant.nativeTaskId = String(resolved.task.id);
              settings = writeSettings(projectPath(), settings);
            }
          }
          item.status = 'success';
          item.outputDirectory = expectedOutput;
          lastOutputDirectory = path.dirname(expectedOutput);
        } catch (error) {
          item.status = 'failure';
          item.error = errorText(error);
          console.error(`[${DISPLAY_NAME}] Variation "${variant.name}" failed.`, error);
        }
      }

      queue.running = false;
      const failures = queue.items.filter((item) => item.status === 'failure');
      lastError = failures.length
        ? failures.map((item) => `${item.name}: ${item.error}`).join('\n\n')
        : '';
      return {
        outputDirectory: currentOutputDirectory(settings),
        queue: queueSnapshot(),
      };
    } catch (error) {
      queue.running = false;
      return recordError(error);
    } finally {
      setBusy(false);
    }
  },

  async estimateSize(input: unknown): Promise<{
    outputDirectory: string;
    estimate: NonNullable<BuildVariantSettings['sizeEstimate']>;
    warning?: string;
  }> {
    if (busy) throw new Error('CGB Studio packer is already running.');
    setBusy(true);
    lastError = '';
    let settings = normalizeSettings(
      input && typeof input === 'object' ? (input as any).settings || input : input,
    );
    const payload = input && typeof input === 'object' ? input as any : {};
    const variant = findVariant(settings, payload.variantId);
    const runId = crypto.randomBytes(10).toString('hex');
    const stagingRelative = path.posix.join(
      'build',
      '.cgb-size-estimate-staging',
      runId,
    );
    const stagingRoot = path.resolve(projectPath(), stagingRelative);
    const buildDirectory = path.join(stagingRoot, 'web-mobile');
    let estimateTaskId = '';
    let beforeIds = new Set<string>();
    let cleanupWarning = '';
    estimateState = {
      running: true,
      variantId: variant.id,
      phase: 'building',
    };
    try {
      loadDeveloperOverrides(projectPath());
      validateVariationFolders(settings.variants);
      const [tasks, builderDefaults, engine, projectScenes] = await Promise.all([
        queryWebMobileTasks(),
        queryBuilderCommonOptions(),
        queryEngineModuleConfigs(),
        queryProjectScenes(),
      ]);
      if (!engine.configs.some((config) =>
        config.key === settings.buildDefaults.engineModulesConfigKey)) {
        throw new Error('The selected Feature Cropping configuration does not exist.');
      }
      validateVariant(variant, projectScenes);
      settings = writeSettings(projectPath(), settings);
      const savedVariant = findVariant(settings, variant.id);
      const { baseTask, splashScreen, fingerprintOptions } = buildContext(
        settings,
        savedVariant,
        tasks,
        builderDefaults,
      );
      const options = createEstimateBuilderOptions(
        baseTask,
        settings,
        savedVariant,
        splashScreen,
        `project://${stagingRelative}`,
        runId,
      );
      beforeIds = new Set(tasks.map((task) => String(task.id)));
      fs.mkdirSync(stagingRoot, { recursive: true });
      const result = await Editor.Message.request('builder', 'add-task', options, true);
      const createdTask = await findEstimateTask(beforeIds, runId);
      estimateTaskId = createdTask ? String(createdTask.id) : '';
      assertBuilderSuccess(result);
      if (!fs.existsSync(buildDirectory)) {
        throw new Error(`Estimate build output does not exist: ${buildDirectory}`);
      }

      estimateState.phase = 'analyzing';
      const analysis = await analyzeDefault(buildDirectory, settings, projectPath());
      estimateState.phase = 'calculating';
      const fingerprint = createEstimateFingerprint(
        projectPath(),
        creatorVersion(),
        fingerprintOptions,
        settings,
        savedVariant,
      );
      const sourceOutput = estimateOutputRelative(savedVariant);
      const outputDirectory = path.resolve(projectPath(), sourceOutput);
      const estimate = {
        calculatedAt: new Date().toISOString(),
        fingerprint,
        sourceOutput,
        base64Bytes: analysis.base64Bytes,
        base122Bytes: analysis.base122Bytes,
        categories: analysis.categories,
      };

      estimateState.phase = 'publishing';
      await replaceDiagnosticOutput(buildDirectory, outputDirectory);
      savedVariant.sizeEstimate = estimate;
      settings = writeSettings(projectPath(), settings);
      cachedEstimateStale[savedVariant.id] = false;
      return { outputDirectory, estimate };
    } catch (error) {
      try {
        markEstimateStale(settings, variant.id);
      } catch (staleError) {
        console.warn('[CGB Studio packer] Could not mark the previous estimate as stale.', staleError);
      }
      estimateState.error = errorText(error);
      return recordError(error);
    } finally {
      estimateState.phase = 'cleanup';
      try {
        if (!estimateTaskId) {
          const createdTask = await findEstimateTask(beforeIds, runId);
          estimateTaskId = createdTask ? String(createdTask.id) : '';
        }
        if (estimateTaskId) await removeEstimateTask(estimateTaskId);
      } catch (error) {
        cleanupWarning = `Could not remove temporary Builder task: ${errorText(error)}`;
        console.warn(`[${DISPLAY_NAME}] ${cleanupWarning}`);
      }
      try {
        fs.rmSync(stagingRoot, { recursive: true, force: true });
        const stagingParent = path.dirname(stagingRoot);
        if (fs.existsSync(stagingParent) && fs.readdirSync(stagingParent).length === 0) {
          fs.rmSync(stagingParent, { recursive: true, force: true });
        }
      } catch (error) {
        const warning = `Could not remove estimate staging: ${errorText(error)}`;
        cleanupWarning = [cleanupWarning, warning].filter(Boolean).join('\n');
        console.warn(`[${DISPLAY_NAME}] ${warning}`);
      }
      estimateState = {
        running: false,
        variantId: variant.id,
        ...(estimateState.error ? { error: estimateState.error } : {}),
        ...(cleanupWarning ? { warning: cleanupWarning } : {}),
      };
      setBusy(false);
    }
  },

  async packExisting(input: unknown): Promise<{
    outputDirectory: string;
    files: string[];
    canceled?: boolean;
  }> {
    if (busy) throw new Error('CGB Studio packer is already running.');
    setBusy(true);
    lastError = '';
    try {
      const payload = input && typeof input === 'object' ? input as any : {};
      const settings = normalizeSettings(payload.settings || input);
      loadDeveloperOverrides(projectPath());
      const variant = findVariant(settings, payload.variantId);
      const selected = await selectDirectory();
      if (!selected) {
        return { outputDirectory: currentOutputDirectory(settings), files: [], canceled: true };
      }
      settings.lastManualInput = selected;
      writeSettings(projectPath(), settings);
      const result = await packDirectory(
        selected,
        settings,
        {
          variationFolder: sanitizeVariationFolder(variant.name),
          variantId: variant.id,
          projectPath: projectPath(),
        },
      );
      lastOutputDirectory = getOutputDirectory(selected);
      return { outputDirectory: result.outputDirectory, files: result.files };
    } catch (error) {
      return recordError(error);
    } finally {
      setBusy(false);
    }
  },

  async selectSplashAsset(input: unknown): Promise<{
    canceled?: boolean;
    file?: string;
    previewDataUrl?: string;
  }> {
    try {
      const source = input && typeof input === 'object' ? input as any : {};
      const variantId = String(source.variantId || '');
      const kind = source.kind === 'background' ? 'background' : 'logo';
      const selected = await selectPath({
        title: `Select splash ${kind}`,
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
      });
      if (!selected) return { canceled: true };
      const file = copySplashAsset(projectPath(), variantId, kind, selected);
      const absolute = resolveStoredSplashFile(projectPath(), file);
      const mime = path.extname(absolute).toLowerCase() === '.png'
        ? 'image/png'
        : 'image/jpeg';
      return {
        file,
        previewDataUrl: `data:${mime};base64,${fs.readFileSync(absolute).toString('base64')}`,
      };
    } catch (error) {
      return recordError(error);
    }
  },

  async duplicateSplashAssets(input: unknown): Promise<{
    logo?: string;
    background?: string;
    previews: {
      logo?: string;
      background?: string;
    };
  }> {
    try {
      const source = input && typeof input === 'object' ? input as any : {};
      const targetVariantId = String(source.targetVariantId || '');
      const result: {
        logo?: string;
        background?: string;
        previews: { logo?: string; background?: string };
      } = { previews: {} };
      for (const kind of ['logo', 'background'] as const) {
        const storedPath = typeof source[`${kind}File`] === 'string'
          ? source[`${kind}File`]
          : '';
        if (!storedPath) continue;
        const original = resolveStoredSplashFile(projectPath(), storedPath);
        const copied = copySplashAsset(projectPath(), targetVariantId, kind, original);
        const absolute = resolveStoredSplashFile(projectPath(), copied);
        const mime = path.extname(absolute).toLowerCase() === '.png'
          ? 'image/png'
          : 'image/jpeg';
        result[kind] = copied;
        result.previews[kind] =
          `data:${mime};base64,${fs.readFileSync(absolute).toString('base64')}`;
      }
      return result;
    } catch (error) {
      return recordError(error);
    }
  },

  async preview(input?: unknown): Promise<void> {
    try {
      const settings = loadSettings(projectPath());
      const payload = input && typeof input === 'object' ? input as any : {};
      const variant = findVariant(settings, payload.variantId);
      const html = previewHtml(settings, variant);
      if (!html) throw new Error(`No enabled previewable HTML exists for "${variant.name}".`);
      await openPath(html);
    } catch (error) {
      recordError(error);
    }
  },

  async openOutput(): Promise<void> {
    try {
      const settings = loadSettings(projectPath());
      await openPath(currentOutputDirectory(settings));
    } catch (error) {
      recordError(error);
    }
  },

  async openDeveloperOverrides(): Promise<{
    path: string;
    outputDirectory: string;
    created: boolean;
    fallback: boolean;
    warning?: string;
  }> {
    try {
      return await openDeveloperOverrides();
    } catch (error) {
      return recordError(error);
    }
  },

  installAdsManager(): {
    path: string;
    installed: boolean;
    created: boolean;
    outputDirectory: string;
  } {
    try {
      const result = installAdsManager(projectPath());
      return { ...result, outputDirectory: path.dirname(result.path) };
    } catch (error) {
      return recordError(error);
    }
  },
};

export function load(): void {}
export function unload(): void {}
