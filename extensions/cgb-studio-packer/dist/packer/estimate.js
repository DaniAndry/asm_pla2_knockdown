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
exports.analyzeCommonMin = exports.analyzeDefault = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const dev_overrides_1 = require("../networks/dev-overrides");
const html_1 = require("./html");
const packer_1 = require("./packer");
const resources_1 = require("./resources");
const splash_1 = require("../splash");
const CATEGORY_LABELS = {
    models: 'Models and animations',
    textures: 'Textures',
    audio: 'Audio',
    fonts: 'Fonts',
    native: 'Native code',
    engine: 'Engine',
    scripts: 'Project scripts',
    data: 'Scenes and serialized data',
    other: 'Other assets',
    zip: 'ZIP metadata',
    runtime: 'HTML, JSZip and CGB runtime',
};
function resourceCategory(resource) {
    const value = resource.path.toLowerCase().replace(/\\/g, '/');
    const extension = path.posix.extname(value);
    if (extension === '.wasm'
        || value.endsWith('.wasm.br')
        || value.endsWith('.asm.js')
        || value.includes('/wasm/'))
        return 'native';
    if (value.startsWith('cocos-js/')
        || /^src\/(?:system|polyfills)\.bundle\.js$/.test(value)
        || /(?:^|\/)cc(?:\.min)?\.js$/.test(value))
        return 'engine';
    if (['.bin', '.cconb'].includes(extension))
        return 'models';
    if (['.webp', '.png', '.jpg', '.jpeg', '.ktx', '.ktx2', '.pvr', '.astc'].includes(extension)) {
        return 'textures';
    }
    if (['.mp3', '.ogg', '.wav', '.m4a', '.aac'].includes(extension))
        return 'audio';
    if (['.ttf', '.otf', '.woff', '.woff2', '.eot', '.ttc'].includes(extension))
        return 'fonts';
    if (extension === '.js' || extension === '.mjs')
        return 'scripts';
    if (['.json', '.ccon', '.scene', '.prefab', '.plist', '.atlas', '.fnt'].includes(extension)
        || value.includes('/config.'))
        return 'data';
    return 'other';
}
function centralDirectoryCompressedSizes(archive) {
    const minimum = Math.max(0, archive.length - 65557);
    let end = archive.length - 22;
    while (end >= minimum && archive.readUInt32LE(end) !== 0x06054b50)
        end -= 1;
    if (end < minimum)
        throw new Error('Could not find the ZIP end-of-central-directory record.');
    const entries = archive.readUInt16LE(end + 10);
    let offset = archive.readUInt32LE(end + 16);
    const output = new Map();
    for (let index = 0; index < entries; index += 1) {
        if (archive.readUInt32LE(offset) !== 0x02014b50) {
            throw new Error('Invalid ZIP central-directory entry.');
        }
        const compressedBytes = archive.readUInt32LE(offset + 20);
        const nameLength = archive.readUInt16LE(offset + 28);
        const extraLength = archive.readUInt16LE(offset + 30);
        const commentLength = archive.readUInt16LE(offset + 32);
        const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
        output.set(name, compressedBytes);
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return output;
}
function distributeEncodedBytes(categories, archiveBytes, encodedBytes, key) {
    const values = Array.from(categories.values()).filter((category) => category.id !== 'runtime');
    let assigned = 0;
    for (let index = 0; index < values.length; index += 1) {
        const category = values[index];
        const value = index === values.length - 1
            ? encodedBytes - assigned
            : Math.floor((category.compressedBytes / archiveBytes) * encodedBytes);
        category[key] = Math.max(0, value);
        assigned += category[key];
    }
}
async function analyzeDefault(inputDirectory, settings, projectPath) {
    const overrides = projectPath
        ? (0, dev_overrides_1.loadDeveloperOverrides)(projectPath)
        : { schemaVersion: 1, adapters: {}, profiles: {} };
    const profile = (0, dev_overrides_1.getEffectiveProfiles)(overrides).find((item) => item.key === 'default');
    if (!profile)
        throw new Error('The Default output profile is unavailable.');
    (0, dev_overrides_1.validateEffectiveProfileOutputs)([profile], true);
    const collector = new resources_1.ResourceCollector(path.resolve(inputDirectory), settings.obfuscate);
    collector.collect();
    const variant = settings.variants.find((item) => item.id === settings.activeVariantId)
        || settings.variants[0];
    if (projectPath && (variant === null || variant === void 0 ? void 0 : variant.splash.mode) === 'override') {
        const settingsPath = 'src/settings.json';
        const source = collector.getText(settingsPath);
        if (!source)
            throw new Error(`Splash override requires ${settingsPath} in the web-mobile build.`);
        const cocosSettings = JSON.parse(source);
        cocosSettings.splashScreen = (0, splash_1.applySplashOverride)(projectPath, (0, splash_1.baseSplashSettings)(cocosSettings.splashScreen), variant.splash);
        collector.replaceText(settingsPath, JSON.stringify(cocosSettings));
    }
    const shell = (0, html_1.createHtmlShell)(inputDirectory, collector);
    const archive = await collector.createArchive(profile.compressed);
    const compressedByPath = centralDirectoryCompressedSizes(archive);
    const categories = new Map();
    const ensure = (id) => {
        const existing = categories.get(id);
        if (existing)
            return existing;
        const created = {
            id,
            label: CATEGORY_LABELS[id] || id,
            rawBytes: 0,
            compressedBytes: 0,
            base64Bytes: 0,
            base122Bytes: 0,
        };
        categories.set(id, created);
        return created;
    };
    let resourceCompressedBytes = 0;
    for (const resource of collector.getReportEntries()) {
        const category = ensure(resourceCategory(resource));
        const compressedBytes = compressedByPath.get(resource.archivePath) || 0;
        category.rawBytes += resource.rawBytes;
        category.compressedBytes += compressedBytes;
        resourceCompressedBytes += compressedBytes;
    }
    const zip = ensure('zip');
    zip.compressedBytes = Math.max(0, archive.length - resourceCompressedBytes);
    const jsZipSource = fs.readFileSync(require.resolve('jszip/dist/jszip.min.js'), 'utf8');
    const totals = { base64: 0, base122: 0 };
    const payloadBytes = { base64: 0, base122: 0 };
    for (const encoding of ['base64', 'base122']) {
        const encodedSettings = { ...settings, assetEncoding: encoding };
        const payload = (0, packer_1.encodePayload)(archive, encoding);
        let html = (0, packer_1.makeHtml)(shell.html, profile, encodedSettings, payload, jsZipSource, shell.startup, shell.stylesheets, !profile.splitResources, {}, overrides);
        if (profile.splitResources) {
            html = html.replace(/<\/head>/i, '<script src="res.js"></script>\n</head>');
        }
        totals[encoding] = Buffer.byteLength(html, 'utf8');
        payloadBytes[encoding] = profile.splitResources ? 0 : Buffer.byteLength(payload, 'utf8');
    }
    distributeEncodedBytes(categories, archive.length, payloadBytes.base64, 'base64Bytes');
    distributeEncodedBytes(categories, archive.length, payloadBytes.base122, 'base122Bytes');
    const runtime = ensure('runtime');
    runtime.rawBytes = Math.max(totals.base64 - payloadBytes.base64, totals.base122 - payloadBytes.base122);
    runtime.base64Bytes = totals.base64 - payloadBytes.base64;
    runtime.base122Bytes = totals.base122 - payloadBytes.base122;
    return {
        base64Bytes: totals.base64,
        base122Bytes: totals.base122,
        categories: Array.from(categories.values())
            .filter((category) => category.rawBytes || category.compressedBytes
            || category.base64Bytes || category.base122Bytes)
            .sort((first, second) => Math.max(second.base64Bytes, second.base122Bytes)
            - Math.max(first.base64Bytes, first.base122Bytes)),
    };
}
exports.analyzeDefault = analyzeDefault;
/** @deprecated Kept for API compatibility with 1.3/1.4 tests and integrations. */
exports.analyzeCommonMin = analyzeDefault;
