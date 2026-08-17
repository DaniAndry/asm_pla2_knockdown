"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unload = exports.load = exports.methods = exports.findPreviewHtml = exports.assertBuilderSuccess = exports.outputFromBuildOptions = exports.projectPackageName = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const childProcess = __importStar(require("child_process"));
const ads_manager_1 = require("./ads-manager");
const builder_tasks_1 = require("./builder-tasks");
const constants_1 = require("./constants");
const estimate_fingerprint_1 = require("./estimate-fingerprint");
const estimate_1 = require("./packer/estimate");
const packer_1 = require("./packer/packer");
const dev_overrides_1 = require("./networks/dev-overrides");
const settings_1 = require("./settings");
const splash_1 = require("./splash");
let busy = false;
let lastError = '';
let lastOutputDirectory = '';
let queue = {
    running: false,
    currentIndex: -1,
    total: 0,
    items: [],
};
let estimateState = { running: false };
let cachedEstimateStale = {};
function projectPath() {
    var _a;
    return ((_a = Editor.Project) === null || _a === void 0 ? void 0 : _a.path) || Editor.projectPath || process.cwd();
}
function creatorVersion() {
    var _a;
    return String(((_a = Editor.App) === null || _a === void 0 ? void 0 : _a.version) || Editor.version || 'unknown');
}
function projectPackageName(projectDirectory) {
    try {
        const packageJson = JSON.parse(fs.readFileSync(path.join(projectDirectory, 'package.json'), 'utf8'));
        return typeof (packageJson === null || packageJson === void 0 ? void 0 : packageJson.name) === 'string' ? packageJson.name.trim() : '';
    }
    catch (_error) {
        return '';
    }
}
exports.projectPackageName = projectPackageName;
function outputFromBuildOptions(options, variationFolder) {
    if (!(options === null || options === void 0 ? void 0 : options.buildPath))
        return '';
    const buildPath = String(options.buildPath).startsWith('project://')
        ? path.resolve(projectPath(), String(options.buildPath).slice('project://'.length).replace(/^[/\\]+/, ''))
        : path.resolve(options.buildPath);
    const buildDirectory = options.outputName
        ? path.join(buildPath, options.outputName)
        : buildPath;
    const root = path.join(path.dirname(buildDirectory), constants_1.OUTPUT_DIRECTORY);
    return variationFolder ? path.join(root, (0, settings_1.sanitizeVariationFolder)(variationFolder)) : root;
}
exports.outputFromBuildOptions = outputFromBuildOptions;
function assertBuilderSuccess(result) {
    // Cocos Creator 3.8 returns BuildExitCode.BUILD_SUCCESS (36) when shouldWait is true.
    // TaskAddResult.SUCCESS (1) is accepted for compatibility with non-waiting implementations.
    if (result === 36 || result === 1)
        return;
    const names = {
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
exports.assertBuilderSuccess = assertBuilderSuccess;
function persistedTaskPackageOptions(packageName, taskId) {
    var _a, _b;
    const profilePath = path.join(projectPath(), 'profiles', 'v2', 'packages', `${packageName}.json`);
    try {
        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        return (_b = (_a = profile === null || profile === void 0 ? void 0 : profile.builder) === null || _a === void 0 ? void 0 : _a.taskOptionsMap) === null || _b === void 0 ? void 0 : _b[taskId];
    }
    catch (_error) {
        return undefined;
    }
}
async function queryWebMobileTasks() {
    try {
        const result = await Editor.Message.request('builder', 'query-tasks-info', {
            type: 'build',
        });
        const tasks = (0, builder_tasks_1.webMobileTasks)(result);
        // Creator stores package-specific task options outside Builder's task
        // object. Hydrate them before comparing configs; otherwise every task has
        // packages: {} and is incorrectly treated as changed.
        await Promise.all(tasks.map(async (task) => {
            const id = String(task.id);
            const options = (task === null || task === void 0 ? void 0 : task.rawOptions) || (task === null || task === void 0 ? void 0 : task.options);
            if (!options)
                return;
            const packages = {};
            for (const packageName of ['web-mobile', constants_1.PACKAGE_NAME]) {
                let value;
                try {
                    value = await Editor.Profile.getProject(packageName, `builder.taskOptionsMap.${id}`);
                }
                catch (_error) { }
                if (!value || typeof value !== 'object' || !Object.keys(value).length) {
                    value = persistedTaskPackageOptions(packageName, id);
                }
                if (value
                    && typeof value === 'object'
                    && Object.keys(value).length) {
                    packages[packageName] = value;
                }
            }
            options.packages = { ...(options.packages || {}), ...packages };
        }));
        return tasks;
    }
    catch (error) {
        console.warn('[CGB Studio packer] Could not query web-mobile build tasks.', error);
        return [];
    }
}
async function queryBuilderCommonOptions() {
    let common = {};
    let splashScreen;
    try {
        common = await Editor.Profile.getProject('builder', 'common') || {};
    }
    catch (error) {
        console.warn('[CGB Studio packer] Could not query Builder defaults.', error);
    }
    try {
        splashScreen = await Editor.Profile.getProject('builder', 'splash-setting');
    }
    catch (error) {
        console.warn('[CGB Studio packer] Could not query Splash settings.', error);
    }
    return {
        ...(common && typeof common === 'object' ? common : {}),
        ...(splashScreen && typeof splashScreen === 'object'
            ? { splashScreen }
            : {}),
    };
}
async function queryEngineModuleConfigs() {
    var _a, _b, _c;
    try {
        const profile = await Editor.Profile.getProject('engine', 'modules') || {};
        const source = profile.configs || ((_a = profile.modules) === null || _a === void 0 ? void 0 : _a.configs) || {};
        const configs = Object.entries(source)
            .map(([key, value]) => ({
            key,
            label: String((value === null || value === void 0 ? void 0 : value.name) || key),
        }))
            .sort((first, second) => first.label.localeCompare(second.label));
        const requestedDefault = String(profile.globalConfigKey || ((_b = profile.modules) === null || _b === void 0 ? void 0 : _b.globalConfigKey) || '');
        const defaultKey = configs.some((config) => config.key === requestedDefault)
            ? requestedDefault
            : ((_c = configs[0]) === null || _c === void 0 ? void 0 : _c.key) || '';
        return { configs, defaultKey };
    }
    catch (error) {
        console.warn('[CGB Studio packer] Could not query Feature Cropping configurations.', error);
        return { configs: [], defaultKey: '' };
    }
}
async function queryProjectScenes() {
    try {
        const assets = await Editor.Message.request('asset-db', 'query-assets', { extname: '.scene' }, ['name', 'url', 'uuid']);
        if (!Array.isArray(assets))
            return [];
        return assets
            .filter(settings_1.isProjectAssetScene)
            .map((asset) => ({
            name: String(asset.name || path.basename(asset.url, '.scene')),
            url: String(asset.url),
            uuid: String(asset.uuid),
        }))
            .sort((first, second) => String(first.name || first.url).localeCompare(String(second.name || second.url)));
    }
    catch (error) {
        console.warn('[CGB Studio packer] Could not query project scenes.', error);
        return [];
    }
}
function setBusy(value) {
    busy = value;
}
function errorText(error) {
    return error instanceof Error ? error.stack || error.message : String(error);
}
function recordError(error) {
    lastError = errorText(error);
    console.error(`[${constants_1.DISPLAY_NAME}]`, error);
    throw error;
}
function currentOutputDirectory(settings) {
    if (lastOutputDirectory)
        return lastOutputDirectory;
    if (settings.lastManualInput)
        return (0, packer_1.getOutputDirectory)(settings.lastManualInput);
    return path.join(projectPath(), 'build', constants_1.OUTPUT_DIRECTORY);
}
async function selectPath(options) {
    const result = await Editor.Dialog.select(options);
    if (Array.isArray(result))
        return result[0];
    if (result === null || result === void 0 ? void 0 : result.canceled)
        return undefined;
    if (Array.isArray(result === null || result === void 0 ? void 0 : result.filePaths))
        return result.filePaths[0];
    return typeof result === 'string' ? result : undefined;
}
async function selectDirectory() {
    return selectPath({
        title: 'Select an existing Cocos web-mobile build',
        properties: ['openDirectory'],
    });
}
async function openPath(target) {
    if (!target || !fs.existsSync(target)) {
        throw new Error(`Path does not exist: ${target || '(empty)'}`);
    }
    const electron = require('electron');
    const error = await electron.shell.openPath(target);
    if (error)
        throw new Error(error);
}
function scriptEditorArguments(executable, commandArgument, filePath) {
    const source = Array.isArray(commandArgument)
        ? commandArgument.map(String)
        : String(commandArgument || '').match(/"[^"]*"|'[^']*'|[^\s]+/g) || [];
    if (!source.length && /^code(?: - insiders)?\.exe$/i.test(path.basename(executable))) {
        return ['--reuse-window', '--goto', `${filePath}:1:1`];
    }
    let containsFilePlaceholder = false;
    const args = source.map((argument) => {
        const unquoted = argument.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_match, double, single) => double === undefined ? single : double);
        return unquoted.replace(/\{\{?(?:file|path)\}?\}|\$\{(?:file|path)\}|%(?:file|path)%/gi, () => {
            containsFilePlaceholder = true;
            return filePath;
        });
    });
    if (!containsFilePlaceholder)
        args.push(filePath);
    return args;
}
function launchConfiguredScriptEditor(configured, filePath) {
    const executable = String((configured === null || configured === void 0 ? void 0 : configured.path) || '');
    if (!executable || !fs.existsSync(executable))
        return false;
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
    }
    catch (_error) {
        return false;
    }
}
function findPreviewHtml(outputDirectory, settings, variant, effectiveProfiles) {
    const variationDirectory = path.join(outputDirectory, (0, settings_1.sanitizeVariationFolder)(variant.name));
    if (!fs.existsSync(variationDirectory))
        return undefined;
    const profiles = effectiveProfiles.filter((profile) => !profile.zip && profile.networkId && settings.networks[profile.networkId]);
    const ordered = [
        ...profiles.filter((profile) => profile.key === 'default'),
        ...profiles.filter((profile) => profile.key !== 'default'),
    ];
    for (const profile of ordered) {
        const directory = settings.createTargetSubfolders
            ? path.join(variationDirectory, profile.directory)
            : variationDirectory;
        if (!fs.existsSync(directory))
            continue;
        const suffix = `%${profile.outputBaseName}.html`.toLowerCase();
        const candidates = fs.readdirSync(directory)
            .filter((file) => file.toLowerCase().endsWith(suffix))
            .map((file) => ({ file: path.join(directory, file), modified: fs.statSync(path.join(directory, file)).mtimeMs }))
            .sort((first, second) => second.modified - first.modified);
        if (candidates[0])
            return candidates[0].file;
    }
    return undefined;
}
exports.findPreviewHtml = findPreviewHtml;
function previewHtml(settings, variant) {
    const overrides = (0, dev_overrides_1.loadDeveloperOverrides)(projectPath());
    return findPreviewHtml(currentOutputDirectory(settings), settings, variant, (0, dev_overrides_1.getEffectiveProfiles)(overrides));
}
function canPreview(settings, variant) {
    if (!variant)
        return false;
    try {
        return Boolean(previewHtml(settings, variant));
    }
    catch (error) {
        console.warn('[CGB Studio packer] Could not resolve Preview output.', error);
        return false;
    }
}
async function openDeveloperOverrides() {
    const result = (0, dev_overrides_1.ensureDeveloperOverridesFile)(projectPath());
    let opened = false;
    try {
        const configured = await Editor.Message.request('program', 'query-program-info', 'scriptEditor');
        opened = launchConfiguredScriptEditor(configured, result.path);
    }
    catch (error) {
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
function taskOptions(task) {
    return (task === null || task === void 0 ? void 0 : task.rawOptions) || (task === null || task === void 0 ? void 0 : task.options) || {};
}
function findVariant(settings, variantId) {
    const id = variantId || settings.activeVariantId;
    const variant = settings.variants.find((item) => item.id === id);
    if (!variant)
        throw new Error('Select a valid CGB variation.');
    return variant;
}
function validateVariantSplash(variant) {
    if (variant.splash.mode !== 'override')
        return;
    if (variant.splash.logo.type === 'custom') {
        (0, splash_1.resolveStoredSplashFile)(projectPath(), variant.splash.logo.file || '');
    }
    if (variant.splash.background.type === 'custom') {
        (0, splash_1.resolveStoredSplashFile)(projectPath(), variant.splash.background.file || '');
    }
}
function initializeFromBaseTask(settings, tasks) {
    const selected = (0, builder_tasks_1.selectBuilderTask)(tasks, settings.buildDefaults.baseTaskId);
    if (!selected)
        return settings;
    const imported = (0, builder_tasks_1.settingsFromBuilderTask)(selected);
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
                first.name = String((start === null || start === void 0 ? void 0 : start.name) || path.basename((start === null || start === void 0 ? void 0 : start.url) || '', '.scene'))
                    .replace(/\.scene$/i, '') || first.name;
            }
        }
    }
    return settings;
}
function initializeGameNameFromProject(settings) {
    if (settings.buildDefaults.name.trim())
        return settings;
    const name = projectPackageName(projectPath());
    if (name)
        settings.buildDefaults.name = name;
    return settings;
}
function queueSnapshot() {
    return JSON.parse(JSON.stringify(queue));
}
function splashPreviews(settings) {
    const previews = {};
    const add = (variant, kind, storedPath) => {
        if (!storedPath)
            return;
        try {
            const absolute = (0, splash_1.resolveStoredSplashFile)(projectPath(), storedPath);
            const mime = path.extname(absolute).toLowerCase() === '.png'
                ? 'image/png'
                : 'image/jpeg';
            const value = `data:${mime};base64,${fs.readFileSync(absolute).toString('base64')}`;
            previews[variant.id] = {
                ...(previews[variant.id] || {}),
                [kind]: value,
            };
        }
        catch (error) {
            console.warn(`[CGB Studio packer] Could not preview ${storedPath}.`, error);
        }
    };
    for (const variant of settings.variants) {
        add(variant, 'logo', variant.splash.logo.file);
        add(variant, 'background', variant.splash.background.file);
    }
    return previews;
}
function setQueue(settings, variants) {
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
async function resolveNewTask(before, settings, variant, splashScreen) {
    const updated = await queryWebMobileTasks();
    const previousIds = new Set(before.map((task) => String(task.id)));
    const matching = updated.filter((task) => (0, builder_tasks_1.buildTaskSettingsEqual)(task, settings, variant, splashScreen));
    const created = matching.find((task) => !previousIds.has(String(task.id)));
    return { tasks: updated, task: created || matching[matching.length - 1] };
}
function baseTaskForVariant(settings, variant, tasks, builderDefaults) {
    var _a, _b, _c, _d, _e;
    const linked = tasks.find((task) => String(task.id) === variant.nativeTaskId);
    const requested = (0, builder_tasks_1.selectBuilderTask)(tasks, settings.buildDefaults.baseTaskId);
    if (!linked)
        return requested || { options: builderDefaults };
    const previousBaseTaskId = (_e = (_d = (_c = (_b = (_a = taskOptions(linked)) === null || _a === void 0 ? void 0 : _a.packages) === null || _b === void 0 ? void 0 : _b[constants_1.PACKAGE_NAME]) === null || _c === void 0 ? void 0 : _c.settingsSnapshot) === null || _d === void 0 ? void 0 : _d.buildDefaults) === null || _e === void 0 ? void 0 : _e.baseTaskId;
    if (previousBaseTaskId && String(previousBaseTaskId) !== String(settings.buildDefaults.baseTaskId || '')) {
        return requested || linked;
    }
    if (!previousBaseTaskId && requested && String(requested.id) !== String(linked.id)) {
        return requested;
    }
    return linked;
}
function buildContext(settings, variant, tasks, builderDefaults) {
    var _a;
    const baseTask = baseTaskForVariant(settings, variant, tasks, builderDefaults);
    const inheritedSplash = (0, splash_1.baseSplashSettings)(builderDefaults === null || builderDefaults === void 0 ? void 0 : builderDefaults.splashScreen, (_a = taskOptions(baseTask)) === null || _a === void 0 ? void 0 : _a.splashScreen);
    const splashScreen = (0, splash_1.applySplashOverride)(projectPath(), inheritedSplash, variant.splash);
    const fingerprintOptions = (0, builder_tasks_1.createBuilderOptions)(baseTask, settings, variant, (0, settings_1.sanitizeVariationFolder)(variant.name), splashScreen, false);
    return { baseTask, splashScreen, fingerprintOptions };
}
function validateVariant(variant, projectScenes) {
    if (!variant.scenes.length) {
        throw new Error(`Variation "${variant.name}" has no scenes.`);
    }
    const availableSceneIds = new Set(projectScenes.map((scene) => scene.uuid));
    const missingScenes = variant.scenes.filter((scene) => !availableSceneIds.has(scene.uuid));
    if (missingScenes.length) {
        throw new Error(`Variation "${variant.name}" contains scenes that do not exist in Assets: `
            + missingScenes.map((scene) => scene.name || scene.url).join(', '));
    }
    if (!variant.scenes.some((scene) => scene.uuid === variant.startScene)) {
        throw new Error(`Variation "${variant.name}" has an invalid start scene.`);
    }
    validateVariantSplash(variant);
}
function estimateOutputRelative(variant) {
    return path.posix.join('build', 'cgb-size-estimate', (0, settings_1.sanitizeVariationFolder)(variant.name), 'web-mobile');
}
async function renameWithRetry(source, destination) {
    const deadline = Date.now() + 10000;
    while (true) {
        try {
            fs.renameSync(source, destination);
            return;
        }
        catch (error) {
            const code = error === null || error === void 0 ? void 0 : error.code;
            if (!['EPERM', 'EACCES', 'EBUSY'].includes(String(code)) || Date.now() >= deadline) {
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 150));
        }
    }
}
async function replaceDiagnosticOutput(source, destination) {
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
    }
    catch (error) {
        if (fs.existsSync(destination))
            fs.rmSync(destination, { recursive: true, force: true });
        if (backedUp && fs.existsSync(backup))
            await renameWithRetry(backup, destination);
        throw error;
    }
}
async function findEstimateTask(beforeIds, runId) {
    const tasks = await queryWebMobileTasks();
    return tasks.find((task) => {
        var _a, _b;
        if (beforeIds.has(String(task.id)))
            return false;
        const options = taskOptions(task);
        return ((_b = (_a = options === null || options === void 0 ? void 0 : options.packages) === null || _a === void 0 ? void 0 : _a[constants_1.PACKAGE_NAME]) === null || _b === void 0 ? void 0 : _b.estimateRunId) === runId
            || String((options === null || options === void 0 ? void 0 : options.taskName) || '').startsWith('CGB Estimate - ');
    });
}
async function removeEstimateTask(taskId) {
    await Editor.Message.request('builder', 'remove-task', taskId);
}
function markEstimateStale(settings, variantId) {
    const variant = settings.variants.find((item) => item.id === variantId);
    if (!(variant === null || variant === void 0 ? void 0 : variant.sizeEstimate) || variant.sizeEstimate.fingerprint.startsWith('stale:'))
        return;
    variant.sizeEstimate.fingerprint = `stale:${variant.sizeEstimate.fingerprint}`;
    (0, settings_1.saveSettings)(projectPath(), settings);
}
function estimateRelevantValue(settings, variant) {
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
function estimateStaleState(settings, tasks, builderDefaults) {
    const output = {};
    const candidates = settings.variants.filter((variant) => variant.sizeEstimate);
    if (!candidates.length)
        return output;
    const environment = (0, estimate_fingerprint_1.createEstimateFingerprintEnvironment)(projectPath(), creatorVersion());
    for (const variant of candidates) {
        const estimate = variant.sizeEstimate;
        try {
            const { fingerprintOptions } = buildContext(settings, variant, tasks, builderDefaults);
            const current = (0, estimate_fingerprint_1.createEstimateFingerprint)(projectPath(), creatorVersion(), fingerprintOptions, settings, variant, environment);
            const sourceOutput = path.resolve(projectPath(), estimate.sourceOutput);
            output[variant.id] = estimate.fingerprint !== current || !fs.existsSync(sourceOutput);
        }
        catch (error) {
            output[variant.id] = true;
        }
    }
    return output;
}
exports.methods = {
    async openPanel() {
        await Editor.Panel.open(constants_1.PACKAGE_NAME);
    },
    async getState() {
        let settings = (0, settings_1.loadSettings)(projectPath());
        const [tasks, projectScenes, engine, builderDefaults] = await Promise.all([
            queryWebMobileTasks(),
            queryProjectScenes(),
            queryEngineModuleConfigs(),
            queryBuilderCommonOptions(),
        ]);
        settings = initializeFromBaseTask(settings, tasks);
        settings = initializeGameNameFromProject(settings);
        if (!settings.buildDefaults.engineModulesConfigKey) {
            const base = (0, builder_tasks_1.selectBuilderTask)(tasks, settings.buildDefaults.baseTaskId);
            const baseKey = base ? (0, builder_tasks_1.settingsFromBuilderTask)(base).engineModulesConfigKey : '';
            settings.buildDefaults.engineModulesConfigKey = baseKey || engine.defaultKey;
        }
        if (!busy) {
            cachedEstimateStale = estimateStaleState(settings, tasks, builderDefaults);
        }
        const activeVariant = settings.variants.find((variant) => variant.id === settings.activeVariantId)
            || settings.variants[0];
        return {
            version: builder_tasks_1.EXTENSION_VERSION,
            settings,
            buildTasks: tasks.map(builder_tasks_1.summarizeBuilderTask),
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
                path: (0, ads_manager_1.getAdsManagerPath)(projectPath()),
                installed: fs.existsSync((0, ads_manager_1.getAdsManagerPath)(projectPath())),
            },
        };
    },
    saveSettings(input) {
        lastError = '';
        const previous = (0, settings_1.loadSettings)(projectPath());
        const saved = (0, settings_1.saveSettings)(projectPath(), input);
        for (const variant of saved.variants) {
            if (!variant.sizeEstimate)
                continue;
            const old = previous.variants.find((item) => item.id === variant.id);
            if (!old || estimateRelevantValue(previous, old) !== estimateRelevantValue(saved, variant)) {
                cachedEstimateStale[variant.id] = true;
            }
        }
        return saved;
    },
    async build(input) {
        var _a;
        if (busy)
            throw new Error('CGB Studio packer is already running.');
        setBusy(true);
        try {
            const payload = input && typeof input === 'object' ? input : {};
            let settings = (0, settings_1.normalizeSettings)(payload.settings || input);
            (0, dev_overrides_1.loadDeveloperOverrides)(projectPath());
            (0, settings_1.validateVariationFolders)(settings.variants);
            const requestedIds = Array.isArray(payload.variantIds)
                ? new Set(payload.variantIds.map(String))
                : new Set(settings.variants.filter((variant) => variant.selected).map((variant) => variant.id));
            const variants = settings.variants.filter((variant) => requestedIds.has(variant.id));
            if (!variants.length)
                throw new Error('Select at least one CGB variation to build.');
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
                if (settings.networks.snapchat)
                    (0, settings_1.validateSnapchatSettings)(variant);
            }
            settings = (0, settings_1.saveSettings)(projectPath(), settings);
            setQueue(settings, variants);
            let tasks = await queryWebMobileTasks();
            for (let index = 0; index < variants.length; index += 1) {
                const variant = settings.variants.find((item) => item.id === variants[index].id);
                queue.currentIndex = index;
                const item = queue.items[index];
                item.status = 'building';
                try {
                    const linked = tasks.find((task) => String(task.id) === variant.nativeTaskId);
                    const baseTask = baseTaskForVariant(settings, variant, tasks, builderDefaults);
                    const inheritedSplash = (0, splash_1.baseSplashSettings)(builderDefaults === null || builderDefaults === void 0 ? void 0 : builderDefaults.splashScreen, (_a = taskOptions(baseTask)) === null || _a === void 0 ? void 0 : _a.splashScreen);
                    const splashScreen = (0, splash_1.applySplashOverride)(projectPath(), inheritedSplash, variant.splash);
                    const variationFolder = (0, settings_1.sanitizeVariationFolder)(variant.name);
                    const options = (0, builder_tasks_1.createBuilderOptions)(baseTask, settings, variant, variationFolder, splashScreen, false);
                    const reuseTask = Boolean(linked)
                        && (0, builder_tasks_1.buildTaskConfigurationEqual)(linked, options, variant.splash.mode === 'override');
                    if (reuseTask)
                        options.taskId = String(linked.id);
                    const expectedOutput = outputFromBuildOptions(options, variationFolder);
                    const before = tasks;
                    const result = await Editor.Message.request('builder', 'add-task', options, true);
                    assertBuilderSuccess(result);
                    if (reuseTask) {
                        tasks = await queryWebMobileTasks();
                    }
                    else {
                        const resolved = await resolveNewTask(before, settings, variant, splashScreen);
                        tasks = resolved.tasks;
                        if (resolved.task) {
                            variant.nativeTaskId = String(resolved.task.id);
                            settings = (0, settings_1.saveSettings)(projectPath(), settings);
                        }
                    }
                    item.status = 'success';
                    item.outputDirectory = expectedOutput;
                    lastOutputDirectory = path.dirname(expectedOutput);
                }
                catch (error) {
                    item.status = 'failure';
                    item.error = errorText(error);
                    console.error(`[${constants_1.DISPLAY_NAME}] Variation "${variant.name}" failed.`, error);
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
        }
        catch (error) {
            queue.running = false;
            return recordError(error);
        }
        finally {
            setBusy(false);
        }
    },
    async estimateSize(input) {
        if (busy)
            throw new Error('CGB Studio packer is already running.');
        setBusy(true);
        lastError = '';
        let settings = (0, settings_1.normalizeSettings)(input && typeof input === 'object' ? input.settings || input : input);
        const payload = input && typeof input === 'object' ? input : {};
        const variant = findVariant(settings, payload.variantId);
        const runId = crypto.randomBytes(10).toString('hex');
        const stagingRelative = path.posix.join('build', '.cgb-size-estimate-staging', runId);
        const stagingRoot = path.resolve(projectPath(), stagingRelative);
        const buildDirectory = path.join(stagingRoot, 'web-mobile');
        let estimateTaskId = '';
        let beforeIds = new Set();
        let cleanupWarning = '';
        estimateState = {
            running: true,
            variantId: variant.id,
            phase: 'building',
        };
        try {
            (0, dev_overrides_1.loadDeveloperOverrides)(projectPath());
            (0, settings_1.validateVariationFolders)(settings.variants);
            const [tasks, builderDefaults, engine, projectScenes] = await Promise.all([
                queryWebMobileTasks(),
                queryBuilderCommonOptions(),
                queryEngineModuleConfigs(),
                queryProjectScenes(),
            ]);
            if (!engine.configs.some((config) => config.key === settings.buildDefaults.engineModulesConfigKey)) {
                throw new Error('The selected Feature Cropping configuration does not exist.');
            }
            validateVariant(variant, projectScenes);
            settings = (0, settings_1.saveSettings)(projectPath(), settings);
            const savedVariant = findVariant(settings, variant.id);
            const { baseTask, splashScreen, fingerprintOptions } = buildContext(settings, savedVariant, tasks, builderDefaults);
            const options = (0, builder_tasks_1.createEstimateBuilderOptions)(baseTask, settings, savedVariant, splashScreen, `project://${stagingRelative}`, runId);
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
            const analysis = await (0, estimate_1.analyzeDefault)(buildDirectory, settings, projectPath());
            estimateState.phase = 'calculating';
            const fingerprint = (0, estimate_fingerprint_1.createEstimateFingerprint)(projectPath(), creatorVersion(), fingerprintOptions, settings, savedVariant);
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
            settings = (0, settings_1.saveSettings)(projectPath(), settings);
            cachedEstimateStale[savedVariant.id] = false;
            return { outputDirectory, estimate };
        }
        catch (error) {
            try {
                markEstimateStale(settings, variant.id);
            }
            catch (staleError) {
                console.warn('[CGB Studio packer] Could not mark the previous estimate as stale.', staleError);
            }
            estimateState.error = errorText(error);
            return recordError(error);
        }
        finally {
            estimateState.phase = 'cleanup';
            try {
                if (!estimateTaskId) {
                    const createdTask = await findEstimateTask(beforeIds, runId);
                    estimateTaskId = createdTask ? String(createdTask.id) : '';
                }
                if (estimateTaskId)
                    await removeEstimateTask(estimateTaskId);
            }
            catch (error) {
                cleanupWarning = `Could not remove temporary Builder task: ${errorText(error)}`;
                console.warn(`[${constants_1.DISPLAY_NAME}] ${cleanupWarning}`);
            }
            try {
                fs.rmSync(stagingRoot, { recursive: true, force: true });
                const stagingParent = path.dirname(stagingRoot);
                if (fs.existsSync(stagingParent) && fs.readdirSync(stagingParent).length === 0) {
                    fs.rmSync(stagingParent, { recursive: true, force: true });
                }
            }
            catch (error) {
                const warning = `Could not remove estimate staging: ${errorText(error)}`;
                cleanupWarning = [cleanupWarning, warning].filter(Boolean).join('\n');
                console.warn(`[${constants_1.DISPLAY_NAME}] ${warning}`);
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
    async packExisting(input) {
        if (busy)
            throw new Error('CGB Studio packer is already running.');
        setBusy(true);
        lastError = '';
        try {
            const payload = input && typeof input === 'object' ? input : {};
            const settings = (0, settings_1.normalizeSettings)(payload.settings || input);
            (0, dev_overrides_1.loadDeveloperOverrides)(projectPath());
            const variant = findVariant(settings, payload.variantId);
            const selected = await selectDirectory();
            if (!selected) {
                return { outputDirectory: currentOutputDirectory(settings), files: [], canceled: true };
            }
            settings.lastManualInput = selected;
            (0, settings_1.saveSettings)(projectPath(), settings);
            const result = await (0, packer_1.packDirectory)(selected, settings, {
                variationFolder: (0, settings_1.sanitizeVariationFolder)(variant.name),
                variantId: variant.id,
                projectPath: projectPath(),
            });
            lastOutputDirectory = (0, packer_1.getOutputDirectory)(selected);
            return { outputDirectory: result.outputDirectory, files: result.files };
        }
        catch (error) {
            return recordError(error);
        }
        finally {
            setBusy(false);
        }
    },
    async selectSplashAsset(input) {
        try {
            const source = input && typeof input === 'object' ? input : {};
            const variantId = String(source.variantId || '');
            const kind = source.kind === 'background' ? 'background' : 'logo';
            const selected = await selectPath({
                title: `Select splash ${kind}`,
                properties: ['openFile'],
                filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
            });
            if (!selected)
                return { canceled: true };
            const file = (0, splash_1.copySplashAsset)(projectPath(), variantId, kind, selected);
            const absolute = (0, splash_1.resolveStoredSplashFile)(projectPath(), file);
            const mime = path.extname(absolute).toLowerCase() === '.png'
                ? 'image/png'
                : 'image/jpeg';
            return {
                file,
                previewDataUrl: `data:${mime};base64,${fs.readFileSync(absolute).toString('base64')}`,
            };
        }
        catch (error) {
            return recordError(error);
        }
    },
    async duplicateSplashAssets(input) {
        try {
            const source = input && typeof input === 'object' ? input : {};
            const targetVariantId = String(source.targetVariantId || '');
            const result = { previews: {} };
            for (const kind of ['logo', 'background']) {
                const storedPath = typeof source[`${kind}File`] === 'string'
                    ? source[`${kind}File`]
                    : '';
                if (!storedPath)
                    continue;
                const original = (0, splash_1.resolveStoredSplashFile)(projectPath(), storedPath);
                const copied = (0, splash_1.copySplashAsset)(projectPath(), targetVariantId, kind, original);
                const absolute = (0, splash_1.resolveStoredSplashFile)(projectPath(), copied);
                const mime = path.extname(absolute).toLowerCase() === '.png'
                    ? 'image/png'
                    : 'image/jpeg';
                result[kind] = copied;
                result.previews[kind] =
                    `data:${mime};base64,${fs.readFileSync(absolute).toString('base64')}`;
            }
            return result;
        }
        catch (error) {
            return recordError(error);
        }
    },
    async preview(input) {
        try {
            const settings = (0, settings_1.loadSettings)(projectPath());
            const payload = input && typeof input === 'object' ? input : {};
            const variant = findVariant(settings, payload.variantId);
            const html = previewHtml(settings, variant);
            if (!html)
                throw new Error(`No enabled previewable HTML exists for "${variant.name}".`);
            await openPath(html);
        }
        catch (error) {
            recordError(error);
        }
    },
    async openOutput() {
        try {
            const settings = (0, settings_1.loadSettings)(projectPath());
            await openPath(currentOutputDirectory(settings));
        }
        catch (error) {
            recordError(error);
        }
    },
    async openDeveloperOverrides() {
        try {
            return await openDeveloperOverrides();
        }
        catch (error) {
            return recordError(error);
        }
    },
    installAdsManager() {
        try {
            const result = (0, ads_manager_1.installAdsManager)(projectPath());
            return { ...result, outputDirectory: path.dirname(result.path) };
        }
        catch (error) {
            return recordError(error);
        }
    },
};
function load() { }
exports.load = load;
function unload() { }
exports.unload = unload;
