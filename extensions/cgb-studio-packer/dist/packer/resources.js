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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeResourcePath = exports.ResourceCollector = exports.isProjectScript = void 0;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const javascript_obfuscator_1 = __importDefault(require("javascript-obfuscator"));
const jszip_1 = __importDefault(require("jszip"));
const mime_types_1 = require("mime-types");
const TEXT_EXTENSIONS = new Set([
    '.atlas',
    '.css',
    '.fnt',
    '.fsh',
    '.html',
    '.js',
    '.json',
    '.manifest',
    '.plist',
    '.shader',
    '.tmx',
    '.ts',
    '.tsx',
    '.txt',
    '.vsh',
    '.xml',
    '.yaml',
    '.yml',
]);
function normalizeRelativePath(value) {
    let normalized = value.replace(/\\/g, '/');
    while (normalized.startsWith('./'))
        normalized = normalized.slice(2);
    while (normalized.startsWith('/'))
        normalized = normalized.slice(1);
    return normalized;
}
function listFiles(directory) {
    const output = [];
    const visit = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const absolute = path.join(current, entry.name);
            if (entry.isDirectory())
                visit(absolute);
            else if (entry.isFile())
                output.push(absolute);
        }
    };
    visit(directory);
    return output.sort();
}
function isTextFile(filePath, mime) {
    const extension = path.extname(filePath).toLowerCase();
    return TEXT_EXTENSIONS.has(extension)
        || mime.startsWith('text/')
        || mime === 'application/javascript'
        || mime === 'application/json'
        || mime === 'application/xml'
        || mime === 'image/svg+xml';
}
function preprocessJavaScript(source) {
    return source
        .replace(/[A-Za-z$0-9]*\.createElement\(\s*['"]script['"]\s*\)/g, '_createLocalJSElement()')
        .replace(/\bnew\s+URL\b/g, 'new _CGB_URL');
}
function obfuscateJavaScript(source, filePath) {
    if (source.length > 500 * 1024
        || filePath.toLowerCase().includes('.min.')
        || source.includes('/script>')) {
        return source;
    }
    try {
        const fileDigest = crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 10);
        return javascript_obfuscator_1.default.obfuscate(source, {
            compact: true,
            controlFlowFlattening: false,
            deadCodeInjection: false,
            debugProtection: false,
            disableConsoleOutput: false,
            identifierNamesGenerator: 'mangled',
            identifiersPrefix: `cgb_${fileDigest}_`,
            numbersToExpressions: false,
            renameGlobals: false,
            rotateStringArray: true,
            selfDefending: false,
            seed: filePath,
            shuffleStringArray: true,
            simplify: true,
            splitStrings: false,
            stringArray: true,
            stringArrayEncoding: [],
            stringArrayIndexShift: true,
            stringArrayWrappersCount: 1,
            stringArrayWrappersChainedCalls: true,
            stringArrayWrappersParametersMaxCount: 2,
            stringArrayWrappersType: 'variable',
            stringArrayThreshold: 0.75,
            unicodeEscapeSequence: false,
        }).getObfuscatedCode();
    }
    catch (error) {
        console.warn(`[CGB Studio packer] Obfuscation skipped for ${filePath}.`, error);
        return source;
    }
}
function isProjectScript(filePath) {
    const normalized = normalizeRelativePath(filePath).toLowerCase();
    if (normalized.startsWith('assets/internal/'))
        return false;
    return /^assets\/[^/]+\/index\.js$/.test(normalized)
        || /^src\/chunks\/.+\.js$/.test(normalized);
}
exports.isProjectScript = isProjectScript;
class ResourceCollector {
    constructor(inputDirectory, obfuscate) {
        this.inputDirectory = inputDirectory;
        this.obfuscate = obfuscate;
        this.resources = new Map();
        this.inlineData = new Map();
        this.storeUrls = {};
        this.storeUrlsByComponentType = new Map();
    }
    collect() {
        for (const absolutePath of listFiles(this.inputDirectory)) {
            const relativePath = normalizeRelativePath(path.relative(this.inputDirectory, absolutePath));
            if (relativePath.toLowerCase() === 'index.html')
                continue;
            const mime = String((0, mime_types_1.lookup)(relativePath) || 'application/octet-stream');
            const buffer = fs.readFileSync(absolutePath);
            if (isTextFile(relativePath, mime)) {
                let text = buffer.toString('utf8');
                this.captureStoreUrls(text);
                if (path.extname(relativePath).toLowerCase() === '.js') {
                    this.captureComponentStoreUrls(text);
                }
                text = this.extractDataUris(text);
                if (path.extname(relativePath).toLowerCase() === '.js') {
                    text = preprocessJavaScript(text);
                    if (this.obfuscate && isProjectScript(relativePath)) {
                        text = obfuscateJavaScript(text, relativePath);
                    }
                }
                this.resources.set(relativePath, {
                    path: relativePath,
                    mime,
                    type: 'text',
                    value: text,
                });
            }
            else {
                this.resources.set(relativePath, {
                    path: relativePath,
                    mime,
                    type: 'binary',
                    value: buffer,
                });
            }
        }
    }
    processHtmlText(value) {
        this.captureStoreUrls(value);
        return this.extractDataUris(value);
    }
    processInlineScript(value) {
        // Cocos uses the inline script to call System.import(). Obfuscating that
        // bootstrap (or SystemJS/polyfills) can change its method lookup and break
        // the loader before project code starts.
        return preprocessJavaScript(this.extractDataUris(value));
    }
    has(relativePath) {
        return this.resources.has(normalizeRelativePath(relativePath));
    }
    getText(relativePath) {
        const resource = this.resources.get(normalizeRelativePath(relativePath));
        return (resource === null || resource === void 0 ? void 0 : resource.type) === 'text' ? resource.value : undefined;
    }
    replaceText(relativePath, value) {
        const normalized = normalizeRelativePath(relativePath);
        const resource = this.resources.get(normalized);
        if (!resource || resource.type !== 'text') {
            throw new Error(`Text resource was not found: ${normalized}`);
        }
        this.captureStoreUrls(value);
        resource.value = this.extractDataUris(value);
    }
    getDetectedStoreUrls(componentTypeIds) {
        if (componentTypeIds) {
            const scoped = {};
            let matched = false;
            for (const typeId of componentTypeIds) {
                const urls = this.storeUrlsByComponentType.get(typeId);
                if (!urls)
                    continue;
                matched = true;
                if (!scoped.googlePlayUrl && urls.googlePlayUrl)
                    scoped.googlePlayUrl = urls.googlePlayUrl;
                if (!scoped.appStoreUrl && urls.appStoreUrl)
                    scoped.appStoreUrl = urls.appStoreUrl;
            }
            // Do not fill a deliberately absent platform URL from another component.
            // NodeHTML_RU, for example, intentionally returns an empty App Store URL.
            if (matched)
                return scoped;
        }
        return { ...this.storeUrls };
    }
    getReportEntries() {
        return Array.from(this.resources.values()).map((resource, index) => ({
            path: resource.path,
            archivePath: `files/${String(index).padStart(6, '0')}`,
            mime: resource.mime,
            rawBytes: typeof resource.value === 'string'
                ? Buffer.byteLength(resource.value, 'utf8')
                : resource.value.length,
        }));
    }
    async createArchive(compressed) {
        const zip = new jszip_1.default();
        const entries = [];
        let index = 0;
        for (const resource of this.resources.values()) {
            const archivePath = `files/${String(index).padStart(6, '0')}`;
            index += 1;
            const size = typeof resource.value === 'string'
                ? Buffer.byteLength(resource.value, 'utf8')
                : resource.value.length;
            entries.push({
                path: resource.path,
                archivePath,
                mime: resource.mime,
                type: resource.type,
                size,
            });
            zip.file(archivePath, resource.value);
        }
        const manifest = { schemaVersion: 1, entries };
        zip.file('__cgb_manifest__.json', JSON.stringify(manifest));
        return zip.generateAsync({
            type: 'nodebuffer',
            compression: compressed ? 'DEFLATE' : 'STORE',
            compressionOptions: compressed ? { level: 9 } : undefined,
        });
    }
    extractDataUris(value) {
        return value.replace(/data:([a-z0-9.+-]+\/[a-z0-9.+-]+)(?:;[^,;]+)*;base64,([a-z0-9+/=\s]+)/gi, (_match, mimeValue, base64Value) => {
            var _a;
            const compactBase64 = base64Value.replace(/\s+/g, '');
            const dedupeKey = `${mimeValue}:${compactBase64}`;
            const existing = this.inlineData.get(dedupeKey);
            if (existing)
                return `cgb://${existing}`;
            const bytes = Buffer.from(compactBase64, 'base64');
            const digest = crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 16);
            const extension = ((_a = String(mimeValue).split('/')[1]) === null || _a === void 0 ? void 0 : _a.replace(/[^a-z0-9]/gi, '')) || 'bin';
            const resourcePath = `__cgb_inline__/${digest}.${extension}`;
            this.inlineData.set(dedupeKey, resourcePath);
            this.resources.set(resourcePath, {
                path: resourcePath,
                mime: mimeValue,
                type: 'binary',
                value: bytes,
            });
            return `cgb://${resourcePath}`;
        });
    }
    captureComponentStoreUrls(value) {
        var _a;
        const starts = Array.from(value.matchAll(/System\.register\s*\(/g), (match) => match.index || 0);
        for (let index = 0; index < starts.length; index += 1) {
            const source = value.slice(starts[index], (_a = starts[index + 1]) !== null && _a !== void 0 ? _a : value.length);
            const ids = Array.from(source.matchAll(/\._RF\.push\(\{\},\s*["']([^"']+)["']/g), (match) => match[1]);
            if (!ids.length)
                continue;
            const urls = {};
            this.captureStoreUrls(source, urls);
            if (!urls.googlePlayUrl && !urls.appStoreUrl)
                continue;
            for (const id of ids)
                this.storeUrlsByComponentType.set(id, { ...urls });
        }
    }
    captureStoreUrls(value, output = this.storeUrls) {
        const normalized = value.replace(/\\\//g, '/');
        for (const match of normalized.matchAll(/https?:\/\/[^\s"'<>\\)\]}]+/gi)) {
            const candidate = match[0].replace(/[.,;:]+$/g, '');
            try {
                const url = new URL(candidate);
                const host = url.hostname.toLowerCase();
                if (!output.googlePlayUrl
                    && host === 'play.google.com'
                    && url.pathname.toLowerCase() === '/store/apps/details'
                    && Boolean(url.searchParams.get('id'))) {
                    output.googlePlayUrl = url.toString();
                }
                if (!output.appStoreUrl
                    && (host === 'apps.apple.com' || host === 'itunes.apple.com')
                    && /\/id\d+(?:\/|$)/i.test(url.pathname)) {
                    output.appStoreUrl = url.toString();
                }
            }
            catch (error) { }
        }
    }
}
exports.ResourceCollector = ResourceCollector;
function normalizeResourcePath(value) {
    return normalizeRelativePath(value.split('?')[0].split('#')[0]);
}
exports.normalizeResourcePath = normalizeResourcePath;
