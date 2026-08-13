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
exports.saveSettings = exports.loadSettings = exports.getSettingsPath = exports.normalizeSettings = exports.validateVariationFolders = exports.sanitizeVariationFolder = exports.normalizeVariant = exports.normalizeSplashOverride = exports.normalizeBuildDefaults = exports.normalizeScenes = exports.isProjectAssetScene = exports.createDefaultSettings = exports.createDefaultVariant = exports.createDefaultSplashOverride = exports.createDefaultBuildSettings = exports.validateSnapchatSettings = exports.parseSnapchatConfig = exports.isValidSnapchatCdnFolder = exports.createDefaultSnapchatSettings = exports.defaultNetworks = void 0;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const constants_1 = require("./constants");
const types_1 = require("./types");
const DEFAULT_SPLASH_COLOR = {
    x: 0.01568627450980392,
    y: 0.03529411764705882,
    z: 0.0392156862745098,
    w: 1,
};
function defaultNetworks(value = true) {
    return Object.fromEntries(types_1.NETWORK_IDS.map((id) => [id, value]));
}
exports.defaultNetworks = defaultNetworks;
function newId() {
    if (typeof crypto.randomUUID === 'function')
        return crypto.randomUUID();
    const bytes = crypto.randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}
function createDefaultSnapchatSettings() {
    return {
        cdnFolder: newId(),
        configJson: '{}',
    };
}
exports.createDefaultSnapchatSettings = createDefaultSnapchatSettings;
function isValidSnapchatCdnFolder(value) {
    return value.length >= 1
        && value.length <= 96
        && value !== '.'
        && value !== '..'
        && /^[A-Za-z0-9._-]+$/.test(value);
}
exports.isValidSnapchatCdnFolder = isValidSnapchatCdnFolder;
function parseSnapchatConfig(variant) {
    try {
        const parsed = JSON.parse(variant.snapchat.configJson);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('config.json must contain a JSON object.');
        }
        return parsed;
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Snapchat config.json for variation "${variant.name}" is invalid: ${detail}`);
    }
}
exports.parseSnapchatConfig = parseSnapchatConfig;
function validateSnapchatSettings(variant) {
    if (!isValidSnapchatCdnFolder(variant.snapchat.cdnFolder)) {
        throw new Error(`Snapchat CDN folder for variation "${variant.name}" must contain 1-96 `
            + 'letters, numbers, dots, underscores or hyphens and cannot equal "." or "..".');
    }
    parseSnapchatConfig(variant);
}
exports.validateSnapchatSettings = validateSnapchatSettings;
function createDefaultBuildSettings() {
    return {
        name: '',
        buildPath: 'project://build',
        outputName: 'web-mobile',
        orientation: 'auto',
        engineModulesConfigKey: '',
        nativeCodeBundleMode: 'asmjs',
    };
}
exports.createDefaultBuildSettings = createDefaultBuildSettings;
function createDefaultSplashOverride() {
    return {
        mode: 'inherit',
        displayRatio: 1,
        logo: { type: 'default' },
        background: {
            type: 'default',
            color: { ...DEFAULT_SPLASH_COLOR },
        },
    };
}
exports.createDefaultSplashOverride = createDefaultSplashOverride;
function createDefaultVariant(name = 'Variation 1') {
    return {
        id: newId(),
        name,
        selected: true,
        scenes: [],
        startScene: '',
        splash: createDefaultSplashOverride(),
        snapchat: createDefaultSnapchatSettings(),
    };
}
exports.createDefaultVariant = createDefaultVariant;
function createDefaultSettings() {
    const variant = createDefaultVariant();
    return {
        schemaVersion: 6,
        assetEncoding: 'base64',
        obfuscate: true,
        autoPackCocosBuilds: true,
        createTargetSubfolders: true,
        networks: defaultNetworks(true),
        buildDefaults: createDefaultBuildSettings(),
        variants: [variant],
        activeVariantId: variant.id,
    };
}
exports.createDefaultSettings = createDefaultSettings;
function nonNegativeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
}
function normalizeEstimateCategory(input) {
    if (!input || typeof input !== 'object')
        return undefined;
    const source = input;
    if (typeof source.id !== 'string' || !source.id)
        return undefined;
    return {
        id: source.id,
        label: typeof source.label === 'string' && source.label ? source.label : source.id,
        rawBytes: nonNegativeNumber(source.rawBytes),
        compressedBytes: nonNegativeNumber(source.compressedBytes),
        base64Bytes: nonNegativeNumber(source.base64Bytes),
        base122Bytes: nonNegativeNumber(source.base122Bytes),
    };
}
function normalizeSizeEstimate(input) {
    if (!input || typeof input !== 'object')
        return undefined;
    const source = input;
    if (typeof source.calculatedAt !== 'string'
        || typeof source.fingerprint !== 'string'
        || typeof source.sourceOutput !== 'string')
        return undefined;
    return {
        calculatedAt: source.calculatedAt,
        fingerprint: source.fingerprint,
        sourceOutput: source.sourceOutput,
        base64Bytes: nonNegativeNumber(source.base64Bytes),
        base122Bytes: nonNegativeNumber(source.base122Bytes),
        categories: Array.isArray(source.categories)
            ? source.categories
                .map(normalizeEstimateCategory)
                .filter((category) => Boolean(category))
            : [],
    };
}
function isProjectAssetScene(input) {
    if (!input || typeof input !== 'object')
        return false;
    const source = input;
    if (typeof source.url !== 'string' || typeof source.uuid !== 'string' || !source.uuid) {
        return false;
    }
    const url = source.url.toLowerCase();
    return url.startsWith('db://assets/') && url.endsWith('.scene');
}
exports.isProjectAssetScene = isProjectAssetScene;
function normalizeScenes(input) {
    if (!Array.isArray(input))
        return [];
    const seen = new Set();
    const scenes = [];
    for (const item of input) {
        if (!isProjectAssetScene(item))
            continue;
        if (seen.has(item.uuid))
            continue;
        seen.add(item.uuid);
        scenes.push({
            url: item.url,
            uuid: item.uuid,
            ...(typeof item.name === 'string' && item.name ? { name: item.name } : {}),
        });
    }
    return scenes;
}
exports.normalizeScenes = normalizeScenes;
function normalizeNativeCodeBundleMode(input) {
    return input === 'wasm' || input === 'both' ? input : 'asmjs';
}
function normalizeBuildDefaults(input) {
    const defaults = createDefaultBuildSettings();
    const source = input && typeof input === 'object'
        ? input
        : {};
    return {
        ...(typeof source.baseTaskId === 'string' && source.baseTaskId
            ? { baseTaskId: source.baseTaskId }
            : {}),
        name: typeof source.name === 'string' ? source.name.trim() : defaults.name,
        buildPath: typeof source.buildPath === 'string' && source.buildPath.trim()
            ? source.buildPath.trim()
            : defaults.buildPath,
        outputName: typeof source.outputName === 'string' && source.outputName.trim()
            ? source.outputName.trim()
            : defaults.outputName,
        orientation: source.orientation === 'portrait' || source.orientation === 'landscape'
            ? source.orientation
            : 'auto',
        engineModulesConfigKey: typeof source.engineModulesConfigKey === 'string'
            ? source.engineModulesConfigKey.trim()
            : '',
        nativeCodeBundleMode: normalizeNativeCodeBundleMode(source.nativeCodeBundleMode),
    };
}
exports.normalizeBuildDefaults = normalizeBuildDefaults;
function finiteNumber(input, fallback, minimum, maximum) {
    const value = Number(input);
    return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}
function normalizeColor(input) {
    const source = input && typeof input === 'object' ? input : {};
    return {
        x: finiteNumber(source.x, DEFAULT_SPLASH_COLOR.x, 0, 1),
        y: finiteNumber(source.y, DEFAULT_SPLASH_COLOR.y, 0, 1),
        z: finiteNumber(source.z, DEFAULT_SPLASH_COLOR.z, 0, 1),
        w: finiteNumber(source.w, DEFAULT_SPLASH_COLOR.w, 0, 1),
    };
}
function normalizeSplashOverride(input) {
    const defaults = createDefaultSplashOverride();
    const source = input && typeof input === 'object' ? input : {};
    const logo = source.logo && typeof source.logo === 'object' ? source.logo : {};
    const background = source.background && typeof source.background === 'object'
        ? source.background
        : {};
    const logoType = logo.type === 'none' || logo.type === 'custom' ? logo.type : 'default';
    const backgroundType = background.type === 'color' || background.type === 'custom'
        ? background.type
        : 'default';
    return {
        mode: source.mode === 'override' ? 'override' : 'inherit',
        displayRatio: finiteNumber(source.displayRatio, defaults.displayRatio, 0.01, 10),
        logo: {
            type: logoType,
            ...(logoType === 'custom' && typeof logo.file === 'string' && logo.file
                ? { file: logo.file }
                : {}),
        },
        background: {
            type: backgroundType,
            color: normalizeColor(background.color),
            ...(backgroundType === 'custom'
                && typeof background.file === 'string'
                && background.file
                ? { file: background.file }
                : {}),
        },
    };
}
exports.normalizeSplashOverride = normalizeSplashOverride;
function sceneDisplayName(scene) {
    if (!scene)
        return '';
    const value = scene.name || path.basename(scene.url, '.scene');
    return value.replace(/\.scene$/i, '').trim();
}
function normalizeVariant(input, index = 0) {
    var _a;
    const source = input && typeof input === 'object'
        ? input
        : {};
    const scenes = normalizeScenes(source.scenes);
    const startScene = typeof source.startScene === 'string'
        && scenes.some((scene) => scene.uuid === source.startScene)
        ? source.startScene
        : ((_a = scenes[0]) === null || _a === void 0 ? void 0 : _a.uuid) || '';
    const start = scenes.find((scene) => scene.uuid === startScene);
    const fallbackName = sceneDisplayName(start) || `Variation ${index + 1}`;
    const sizeEstimate = normalizeSizeEstimate(source.sizeEstimate);
    const snapchatSource = source.snapchat && typeof source.snapchat === 'object'
        ? source.snapchat
        : {};
    const hasCdnFolder = typeof snapchatSource.cdnFolder === 'string';
    const requestedCdnFolder = hasCdnFolder ? snapchatSource.cdnFolder.trim() : '';
    return {
        id: typeof source.id === 'string' && source.id ? source.id : newId(),
        name: typeof source.name === 'string' && source.name.trim()
            ? source.name.trim()
            : fallbackName,
        selected: typeof source.selected === 'boolean' ? source.selected : true,
        ...(typeof source.nativeTaskId === 'string' && source.nativeTaskId
            ? { nativeTaskId: source.nativeTaskId }
            : {}),
        scenes,
        startScene,
        splash: normalizeSplashOverride(source.splash),
        snapchat: {
            // Missing legacy values are migrated once. Invalid persisted values stay
            // visible so target validation can report them instead of silently changing output paths.
            cdnFolder: hasCdnFolder ? requestedCdnFolder : createDefaultSnapchatSettings().cdnFolder,
            configJson: typeof snapchatSource.configJson === 'string'
                ? snapchatSource.configJson
                : '{}',
        },
        ...(sizeEstimate ? { sizeEstimate } : {}),
    };
}
exports.normalizeVariant = normalizeVariant;
function migrateVersion2(source) {
    var _a;
    const old = (source === null || source === void 0 ? void 0 : source.buildTask) && typeof source.buildTask === 'object' ? source.buildTask : {};
    const scenes = normalizeScenes(old.scenes);
    const startScene = typeof old.startScene === 'string'
        && scenes.some((scene) => scene.uuid === old.startScene)
        ? old.startScene
        : ((_a = scenes[0]) === null || _a === void 0 ? void 0 : _a.uuid) || '';
    const start = scenes.find((scene) => scene.uuid === startScene);
    const variant = normalizeVariant({
        name: sceneDisplayName(start) || old.name || 'Variation 1',
        nativeTaskId: old.taskId,
        scenes,
        startScene,
    });
    return {
        buildDefaults: normalizeBuildDefaults({
            baseTaskId: old.taskId,
            name: old.name,
            buildPath: old.buildPath,
            outputName: old.outputName,
            orientation: old.orientation,
            engineModulesConfigKey: old.engineModulesConfigKey,
            nativeCodeBundleMode: old.nativeCodeBundleMode,
        }),
        variants: [variant],
        activeVariantId: variant.id,
    };
}
function sanitizeVariationFolder(value) {
    return String(value || '')
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
        .replace(/[.\s]+$/g, '')
        .trim()
        .slice(0, 96);
}
exports.sanitizeVariationFolder = sanitizeVariationFolder;
function validateVariationFolders(variants) {
    const seen = new Map();
    for (const variant of variants) {
        const folder = sanitizeVariationFolder(variant.name);
        if (!folder || folder === '.' || folder === '..') {
            throw new Error(`Variation "${variant.name || '(unnamed)'}" has an invalid output folder name.`);
        }
        const key = folder.toLocaleLowerCase();
        const existing = seen.get(key);
        if (existing) {
            throw new Error(`Variations "${existing}" and "${variant.name}" use the same output folder.`);
        }
        seen.set(key, variant.name);
    }
}
exports.validateVariationFolders = validateVariationFolders;
function normalizeSettings(input) {
    const defaults = createDefaultSettings();
    if (!input || typeof input !== 'object')
        return defaults;
    const source = input;
    const rawNetworks = source.networks && typeof source.networks === 'object'
        ? source.networks
        : {};
    const migrated = Number(source.schemaVersion) < 3 || source.buildTask
        ? migrateVersion2(source)
        : undefined;
    const variantsInput = (migrated === null || migrated === void 0 ? void 0 : migrated.variants) || source.variants;
    const variants = Array.isArray(variantsInput) && variantsInput.length
        ? variantsInput.map((variant, index) => normalizeVariant(variant, index))
        : defaults.variants;
    const requestedActive = (migrated === null || migrated === void 0 ? void 0 : migrated.activeVariantId) || source.activeVariantId;
    const activeVariantId = typeof requestedActive === 'string'
        && variants.some((variant) => variant.id === requestedActive)
        ? requestedActive
        : variants[0].id;
    return {
        schemaVersion: 6,
        assetEncoding: source.assetEncoding === 'base122' ? 'base122' : 'base64',
        obfuscate: typeof source.obfuscate === 'boolean' ? source.obfuscate : defaults.obfuscate,
        autoPackCocosBuilds: typeof source.autoPackCocosBuilds === 'boolean'
            ? source.autoPackCocosBuilds
            : defaults.autoPackCocosBuilds,
        createTargetSubfolders: typeof source.createTargetSubfolders === 'boolean'
            ? source.createTargetSubfolders
            : true,
        networks: Object.fromEntries(types_1.NETWORK_IDS.map((id) => [id, typeof rawNetworks[id] === 'boolean' ? rawNetworks[id] : true])),
        buildDefaults: (migrated === null || migrated === void 0 ? void 0 : migrated.buildDefaults) || normalizeBuildDefaults(source.buildDefaults),
        variants,
        activeVariantId,
        ...(typeof source.lastManualInput === 'string' && source.lastManualInput
            ? { lastManualInput: source.lastManualInput }
            : {}),
    };
}
exports.normalizeSettings = normalizeSettings;
function getSettingsPath(projectPath) {
    return path.join(projectPath, 'settings', constants_1.SETTINGS_FILE);
}
exports.getSettingsPath = getSettingsPath;
function loadSettings(projectPath) {
    const filePath = getSettingsPath(projectPath);
    try {
        if (!fs.existsSync(filePath))
            return createDefaultSettings();
        return normalizeSettings(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    }
    catch (error) {
        console.warn(`[CGB Studio packer] Invalid settings file ${filePath}; defaults are used.`, error);
        return createDefaultSettings();
    }
}
exports.loadSettings = loadSettings;
function saveSettings(projectPath, input) {
    const settings = normalizeSettings(input);
    validateVariationFolders(settings.variants);
    const filePath = getSettingsPath(projectPath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.tmp-${process.pid}`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, filePath);
    return settings;
}
exports.saveSettings = saveSettings;
