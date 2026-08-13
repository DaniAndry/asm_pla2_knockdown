"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEstimateBuilderOptions = exports.createBuilderOptions = exports.buildTaskConfigurationEqual = exports.buildTaskSettingsEqual = exports.selectBuilderTask = exports.webMobileTasks = exports.summarizeBuilderTask = exports.settingsFromBuilderTask = exports.cloneBuilderOptions = exports.EXTENSION_VERSION = void 0;
const constants_1 = require("./constants");
const settings_1 = require("./settings");
exports.EXTENSION_VERSION = '1.8.0';
function cloneBuilderOptions(options) {
    const clone = JSON.parse(JSON.stringify(options || {}));
    delete clone.logDest;
    delete clone.id;
    return clone;
}
exports.cloneBuilderOptions = cloneBuilderOptions;
function settingsFromBuilderTask(task) {
    var _a, _b;
    const options = (task === null || task === void 0 ? void 0 : task.rawOptions) || (task === null || task === void 0 ? void 0 : task.options) || {};
    const webOptions = ((_a = options === null || options === void 0 ? void 0 : options.packages) === null || _a === void 0 ? void 0 : _a['web-mobile']) || {};
    const common = (0, settings_1.normalizeBuildDefaults)({
        baseTaskId: task === null || task === void 0 ? void 0 : task.id,
        name: options.name,
        buildPath: options.buildPath,
        outputName: options.outputName,
        orientation: webOptions.orientation,
        engineModulesConfigKey: options.engineModulesConfigKey,
        nativeCodeBundleMode: options.nativeCodeBundleMode,
    });
    const scenes = (0, settings_1.normalizeScenes)(options.scenes);
    const startScene = typeof options.startScene === 'string'
        && scenes.some((scene) => scene.uuid === options.startScene)
        ? options.startScene
        : ((_b = scenes[0]) === null || _b === void 0 ? void 0 : _b.uuid) || '';
    return {
        ...common,
        taskId: String((task === null || task === void 0 ? void 0 : task.id) || ''),
        taskName: String(options.taskName || 'web-mobile'),
        scenes,
        startScene,
        useSplashScreen: options.useSplashScreen === true,
        ...(options.splashScreen && typeof options.splashScreen === 'object'
            ? { splashScreen: JSON.parse(JSON.stringify(options.splashScreen)) }
            : {}),
    };
}
exports.settingsFromBuilderTask = settingsFromBuilderTask;
function summarizeBuilderTask(task) {
    const settings = settingsFromBuilderTask(task);
    const label = [settings.taskName, settings.name].filter(Boolean).join(' - ') || String(task.id);
    return {
        id: String(task.id),
        label,
        settings,
    };
}
exports.summarizeBuilderTask = summarizeBuilderTask;
function webMobileTasks(result) {
    const list = Array.isArray(result === null || result === void 0 ? void 0 : result.list) ? result.list : [];
    return list
        .filter((task) => {
        const options = (task === null || task === void 0 ? void 0 : task.rawOptions) || (task === null || task === void 0 ? void 0 : task.options);
        return (options === null || options === void 0 ? void 0 : options.platform) === 'web-mobile' && !(options === null || options === void 0 ? void 0 : options.preview);
    })
        .sort((first, second) => Number(first.id || 0) - Number(second.id || 0));
}
exports.webMobileTasks = webMobileTasks;
function selectBuilderTask(tasks, preferredId) {
    if (preferredId) {
        const preferred = tasks.find((task) => String(task.id) === preferredId);
        if (preferred)
            return preferred;
    }
    return tasks[tasks.length - 1];
}
exports.selectBuilderTask = selectBuilderTask;
function comparableTask(value) {
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
function desiredTaskSettings(settings, variant, baseTask, splashScreen) {
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
function buildTaskSettingsEqual(task, settings, variant, splashScreen) {
    var _a, _b;
    if (!task)
        return false;
    const options = (task === null || task === void 0 ? void 0 : task.rawOptions) || (task === null || task === void 0 ? void 0 : task.options) || {};
    if (options.debug === true
        || options.sourceMaps === true
        || options.mangleProperties === true
        || options.md5Cache === true
        || options.skipCompressTexture === true
        || options.useWebGPU === true
        || ((_b = (_a = options.packages) === null || _a === void 0 ? void 0 : _a['web-mobile']) === null || _b === void 0 ? void 0 : _b.useWebGPU) === true) {
        return false;
    }
    return JSON.stringify(comparableTask(settingsFromBuilderTask(task)))
        === JSON.stringify(comparableTask(desiredTaskSettings(settings, variant, task, splashScreen)));
}
exports.buildTaskSettingsEqual = buildTaskSettingsEqual;
function comparableBuilderOptions(input, ignoreSplash) {
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
        delete options.packages[constants_1.PACKAGE_NAME];
    }
    return options;
}
/** Scene selection, start scene, variation name and packer snapshot are mutable
 * task inputs. Everything else belongs to the reusable native build config. */
function buildTaskConfigurationEqual(task, desiredOptions, ignoreSplash = false) {
    if (!task)
        return false;
    const actual = (task === null || task === void 0 ? void 0 : task.rawOptions) || (task === null || task === void 0 ? void 0 : task.options) || {};
    return JSON.stringify(comparableBuilderOptions(actual, ignoreSplash))
        === JSON.stringify(comparableBuilderOptions(desiredOptions, ignoreSplash));
}
exports.buildTaskConfigurationEqual = buildTaskConfigurationEqual;
function createBuilderOptions(baseTask, settings, variant, variationFolder, splashScreen, reuseTask = false) {
    var _a;
    const buildDefaults = (0, settings_1.normalizeBuildDefaults)(settings.buildDefaults);
    if (!buildDefaults.name)
        throw new Error('Build game name is required.');
    if (!buildDefaults.engineModulesConfigKey) {
        throw new Error('Select a Feature Cropping configuration.');
    }
    if (!variant.scenes.length) {
        throw new Error(`Variation "${variant.name}" must include at least one scene.`);
    }
    if (!variant.scenes.some((scene) => scene.uuid === variant.startScene)) {
        throw new Error(`Variation "${variant.name}" must have a valid start scene.`);
    }
    const options = cloneBuilderOptions((baseTask === null || baseTask === void 0 ? void 0 : baseTask.rawOptions) || (baseTask === null || baseTask === void 0 ? void 0 : baseTask.options));
    options.platform = 'web-mobile';
    if (reuseTask && (baseTask === null || baseTask === void 0 ? void 0 : baseTask.id))
        options.taskId = String(baseTask.id);
    else
        delete options.taskId;
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
            ...(((_a = options.packages) === null || _a === void 0 ? void 0 : _a['web-mobile']) || {}),
            orientation: buildDefaults.orientation,
            useWebGPU: false,
        },
        [constants_1.PACKAGE_NAME]: {
            forcePack: true,
            settingsSnapshot: JSON.parse(JSON.stringify(settings)),
            variationFolder,
            variantId: variant.id,
        },
    };
    return options;
}
exports.createBuilderOptions = createBuilderOptions;
function createEstimateBuilderOptions(baseTask, settings, variant, splashScreen, buildPath, runId) {
    const options = createBuilderOptions(baseTask, settings, variant, variant.name, splashScreen, false);
    delete options.taskId;
    options.taskName = `CGB Estimate - ${variant.name}`;
    options.buildPath = buildPath;
    options.outputName = 'web-mobile';
    options.packages[constants_1.PACKAGE_NAME] = {
        estimateOnly: true,
        estimateRunId: runId,
        variantId: variant.id,
    };
    return options;
}
exports.createEstimateBuilderOptions = createEstimateBuilderOptions;
