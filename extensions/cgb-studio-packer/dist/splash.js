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
exports.copySplashAsset = exports.applySplashOverride = exports.resolveStoredSplashFile = exports.baseSplashSettings = exports.DEFAULT_COCOS_SPLASH = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const MAX_SPLASH_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
exports.DEFAULT_COCOS_SPLASH = {
    displayRatio: 1,
    totalTime: 2000,
    watermarkLocation: 'default',
    autoFit: true,
    logo: { type: 'default' },
    background: {
        type: 'default',
        color: {
            x: 0.01568627450980392,
            y: 0.03529411764705882,
            z: 0.0392156862745098,
            w: 1,
        },
    },
};
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
function mergeSplash(base, override) {
    if (!override)
        return clone(base);
    return {
        ...clone(base),
        ...clone(override),
        logo: override.logo ? clone(override.logo) : clone(base.logo),
        background: override.background
            ? {
                ...(base.background ? clone(base.background) : {}),
                ...clone(override.background),
            }
            : clone(base.background),
    };
}
function baseSplashSettings(...values) {
    let result = clone(exports.DEFAULT_COCOS_SPLASH);
    for (const value of values) {
        if (value && typeof value === 'object') {
            result = mergeSplash(result, value);
        }
    }
    return result;
}
exports.baseSplashSettings = baseSplashSettings;
function extensionMime(extension) {
    return extension.toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
}
function resolveStoredSplashFile(projectPath, storedPath) {
    const absolute = path.resolve(projectPath, storedPath);
    const projectRoot = path.resolve(projectPath);
    const relative = path.relative(projectRoot, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`Splash asset must be stored inside the project: ${storedPath}`);
    }
    if (!fs.existsSync(absolute)) {
        throw new Error(`Splash asset does not exist: ${storedPath}`);
    }
    const extension = path.extname(absolute).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
        throw new Error(`Unsupported splash image format: ${extension || '(none)'}`);
    }
    const stat = fs.statSync(absolute);
    if (!stat.isFile() || stat.size > MAX_SPLASH_BYTES) {
        throw new Error(`Splash image must be a file no larger than 5 MB: ${storedPath}`);
    }
    return absolute;
}
exports.resolveStoredSplashFile = resolveStoredSplashFile;
function fileDataUri(projectPath, storedPath) {
    const absolute = resolveStoredSplashFile(projectPath, storedPath);
    const mime = extensionMime(path.extname(absolute));
    return `data:${mime};base64,${fs.readFileSync(absolute).toString('base64')}`;
}
function applySplashOverride(projectPath, inherited, override) {
    if (override.mode !== 'override')
        return clone(inherited);
    const output = clone(inherited);
    output.displayRatio = override.displayRatio;
    output.logo = override.logo.type === 'custom'
        ? {
            type: 'custom',
            base64: fileDataUri(projectPath, override.logo.file || ''),
        }
        : { type: override.logo.type };
    output.background = override.background.type === 'custom'
        ? {
            type: 'custom',
            base64: fileDataUri(projectPath, override.background.file || ''),
        }
        : override.background.type === 'color'
            ? {
                type: 'color',
                color: clone(override.background.color),
            }
            : { type: 'default' };
    return output;
}
exports.applySplashOverride = applySplashOverride;
function copySplashAsset(projectPath, variantId, kind, sourcePath) {
    const source = path.resolve(sourcePath);
    const extension = path.extname(source).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
        throw new Error('Splash image must be PNG, JPG or JPEG.');
    }
    const stat = fs.statSync(source);
    if (!stat.isFile() || stat.size > MAX_SPLASH_BYTES) {
        throw new Error('Splash image must be no larger than 5 MB.');
    }
    const safeVariantId = String(variantId).replace(/[^a-z0-9_-]/gi, '');
    if (!safeVariantId)
        throw new Error('Variation ID is invalid.');
    const directory = path.join(projectPath, 'settings', 'cgb-studio-packer-assets', 'splash', safeVariantId);
    fs.mkdirSync(directory, { recursive: true });
    const destination = path.join(directory, `${kind}${extension}`);
    const temporary = `${destination}.tmp-${process.pid}`;
    fs.copyFileSync(source, temporary);
    fs.renameSync(temporary, destination);
    for (const otherExtension of ALLOWED_EXTENSIONS) {
        const other = path.join(directory, `${kind}${otherExtension}`);
        if (other !== destination && fs.existsSync(other))
            fs.rmSync(other, { force: true });
    }
    return path.relative(projectPath, destination).replace(/\\/g, '/');
}
exports.copySplashAsset = copySplashAsset;
