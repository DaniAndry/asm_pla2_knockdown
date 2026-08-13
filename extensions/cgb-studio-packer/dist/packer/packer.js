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
exports.packDirectory = exports.atomicPromote = exports.getOutputDirectory = exports.makeHtml = exports.encodePayload = exports.insertBeforeClosingTag = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const jszip_1 = __importDefault(require("jszip"));
const constants_1 = require("../constants");
const base122_1 = require("../codec/base122");
const adapters_1 = require("../networks/adapters");
const dev_overrides_1 = require("../networks/dev-overrides");
const mraid_lifecycle_1 = require("../networks/mraid-lifecycle");
const settings_1 = require("../settings");
const settings_2 = require("../settings");
const splash_1 = require("../splash");
const html_1 = require("./html");
const resources_1 = require("./resources");
const runtime_1 = require("./runtime");
const playable_bridge_1 = require("./playable-bridge");
function activeSceneComponentTypes(projectPath, variant) {
    if (!projectPath)
        return [];
    const scene = variant.scenes.find((item) => item.uuid === variant.startScene);
    if (!(scene === null || scene === void 0 ? void 0 : scene.url.startsWith('db://assets/')))
        return [];
    const absolute = path.join(projectPath, scene.url.slice('db://'.length).replace(/\//g, path.sep));
    if (!fs.existsSync(absolute))
        return [];
    try {
        const serialized = JSON.parse(fs.readFileSync(absolute, 'utf8'));
        if (!Array.isArray(serialized))
            return [];
        return serialized.flatMap((item) => (item && typeof item.__type__ === 'string' && !item.__type__.startsWith('cc.')
            ? [item.__type__]
            : []));
    }
    catch (error) {
        console.warn(`[CGB Studio packer] Could not inspect start scene ${scene.url}.`, error);
        return [];
    }
}
function applyPackedSplashOverride(collector, projectPath, variant) {
    if (!projectPath || variant.splash.mode !== 'override')
        return;
    const settingsPath = 'src/settings.json';
    const source = collector.getText(settingsPath);
    if (!source)
        throw new Error(`Splash override requires ${settingsPath} in the web-mobile build.`);
    const cocosSettings = JSON.parse(source);
    cocosSettings.splashScreen = (0, splash_1.applySplashOverride)(projectPath, (0, splash_1.baseSplashSettings)(cocosSettings.splashScreen), variant.splash);
    collector.replaceText(settingsPath, JSON.stringify(cocosSettings));
}
function safeInlineJson(value) {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}
function sanitizeFileName(value) {
    return value
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
        .replace(/[.\s]+$/g, '')
        .trim()
        .slice(0, 96);
}
function withTitle(title, baseName, extension) {
    const safeTitle = sanitizeFileName(title)
        .replace(/^Cocos Creator\s*-\s*/i, '');
    return `${safeTitle ? `${safeTitle}%` : ''}${baseName}.${extension}`;
}
function insertBeforeClosingTag(html, tag, content) {
    const expression = new RegExp(`</${tag}>`, 'i');
    if (expression.test(html)) {
        // A Base122 payload may contain String.replace tokens such as $&, $` and $'.
        // Returning from a callback inserts the payload literally.
        return html.replace(expression, () => `${content}\n</${tag}>`);
    }
    return `${html}\n${content}`;
}
exports.insertBeforeClosingTag = insertBeforeClosingTag;
function encodePayload(archive, encoding) {
    return encoding === 'base122'
        ? (0, base122_1.encodeBase122)(new Uint8Array(archive.buffer, archive.byteOffset, archive.byteLength))
        : archive.toString('base64');
}
exports.encodePayload = encodePayload;
function payloadAssignments(encoding, payload) {
    return [
        `window.__CGB_ENCODING__=${JSON.stringify(encoding)};`,
        `window.__CGB_PAYLOAD__=${(0, base122_1.safeInlineString)(payload)};`,
    ].join('');
}
function assertGoogleHtml(html, profile) {
    if (profile.networkId !== 'google')
        return;
    if (!html.includes(constants_1.GOOGLE_EXIT_API_URL)) {
        throw new Error(`${profile.key}: official Google exitapi.js script is missing.`);
    }
    if (!/\bExitApi\.exit\s*\(\s*\)/.test(html)) {
        throw new Error(`${profile.key}: direct ExitApi.exit() call is missing.`);
    }
    if (/window\.open\s*\([^)]*ExitApi\.exit/.test(html)) {
        throw new Error(`${profile.key}: ExitApi.exit() must not be wrapped in window.open().`);
    }
}
function assertSnapchatHtml(html, profile) {
    if (profile.networkId !== 'snapchat')
        return;
    if (!/<script\s+src=["']mraid\.js["']><\/script>/i.test(html)) {
        throw new Error(`${profile.key}: mraid.js script is missing.`);
    }
    if (!/function\s+snapchatCta\s*\(\s*\)/.test(html)) {
        throw new Error(`${profile.key}: snapchatCta() function literal is missing.`);
    }
    if (!html.includes('{{ .ClickTrackingUrl }}')) {
        throw new Error(`${profile.key}: Snapchat click-tracking placeholder is missing.`);
    }
    if (!/window\.snapchatCta\s*\(\s*\)/.test(html)) {
        throw new Error(`${profile.key}: Snapchat CTA invocation is missing.`);
    }
}
function assertUnityHtml(html, profile) {
    if (profile.networkId !== 'unity')
        return;
    if (!/mraid\.open\(["']https:\/\/(?:play\.google\.com\/store\/apps\/details\?id=|(?:apps|itunes)\.apple\.com\/)/i.test(html)) {
        throw new Error('Unity output does not contain a validator-visible direct store URL call.');
    }
}
function assertLifecycleHtml(html, profile) {
    if (profile.adapter.mraid === 'standard') {
        if (!/<script\s+src=["']mraid\.js["']><\/script>/i.test(html)) {
            throw new Error(`${profile.key}: standard MRAID target must reference mraid.js.`);
        }
        for (const literal of ['viewableChange', 'exposureChange', 'sizeChange', 'audioVolumeChange', 'orientationchange']) {
            if (!html.includes(literal))
                throw new Error(`${profile.key}: shared MRAID lifecycle is missing ${literal}.`);
        }
    }
    else if (profile.adapter.mraid === 'bigo') {
        if (!html.includes('window.BGY_MRAID'))
            throw new Error(`${profile.key}: BGY_MRAID lifecycle is missing.`);
    }
}
function assertMintegralHtml(html, profile) {
    if (profile.networkId !== 'mintegral')
        return;
    for (const expression of [
        /function\s+gameStart\s*\(/,
        /function\s+gameClose\s*\(/,
        /window\.gameReady\s*\(/,
        /window\.gameStart\s*\(\s*\)/,
        /window\.gameEnd\s*\(\s*\)/,
    ]) {
        if (!expression.test(html))
            throw new Error(`${profile.key}: required Mintegral lifecycle callback is missing.`);
    }
}
function assertProfileContract(profile) {
    if (profile.networkId === 'snapchat') {
        if (!profile.zip)
            throw new Error(`${profile.key}: Snapchat output must remain a ZIP.`);
        if (profile.snapchatMode === 'inline' && profile.splitResources) {
            throw new Error(`${profile.key}: Snapchat Ads API ZIP must keep its payload inline.`);
        }
        if (profile.snapchatMode === 'cdn' && !profile.splitResources) {
            throw new Error(`${profile.key}: Snapchat CDN ZIP must keep its res.js resource split.`);
        }
    }
}
function makeHtml(shellHtml, profile, settings, payload, jsZipSource, startup, stylesheets, inlinePayload, storeUrls = {}, overrides = { schemaVersion: 1, adapters: {}, profiles: {} }) {
    let html = shellHtml;
    const generatedScript = profile.networkId === 'unity'
        ? (0, adapters_1.createUnityAdapterScript)(storeUrls)
        : profile.adapter.script;
    const adapter = (0, dev_overrides_1.applyAdapterOverride)(profile.adapter, overrides, generatedScript);
    const effectiveProfile = { ...profile, adapter };
    const head = [effectiveProfile.metaHtml, adapter.headHtml].filter(Boolean).join('\n');
    if (head)
        html = insertBeforeClosingTag(html, 'head', head);
    const assignments = inlinePayload ? payloadAssignments(settings.assetEncoding, payload) : '';
    const runtime = [
        '<script type="text/javascript">',
        assignments,
        `window.__CGB_STARTUP__=${safeInlineJson(startup)};`,
        `window.__CGB_STYLESHEETS__=${safeInlineJson(stylesheets)};`,
        `window.super_html_channel=${JSON.stringify(adapter.id)};`,
        jsZipSource,
        (0, runtime_1.getBrowserRuntimeSource)(),
        // Network adapter is deliberately injected after resource obfuscation.
        adapter.script,
        // Keep the project-facing super_html_playable.ts contract consistent for every target.
        (0, playable_bridge_1.getPlayableBridgeSource)(),
        adapter.mraid
            ? (0, mraid_lifecycle_1.createMraidLifecycleScript)(adapter.mraid)
            : 'window.__cgbStart();',
        '</script>',
    ].join('\n');
    html = insertBeforeClosingTag(html, 'body', runtime);
    assertGoogleHtml(html, effectiveProfile);
    assertSnapchatHtml(html, effectiveProfile);
    assertUnityHtml(html, effectiveProfile);
    assertLifecycleHtml(html, effectiveProfile);
    assertMintegralHtml(html, effectiveProfile);
    return html;
}
exports.makeHtml = makeHtml;
const SNAPCHAT_CDN_PREFIX = 'https://rtb-ads.shadow.snapads.com/html5';
function profileRelativePath(profile, settings, fileName) {
    return settings.createTargetSubfolders
        ? path.join(profile.directory, fileName)
        : fileName;
}
async function writeProfile(stagingDirectory, inputDirectory, profile, settings, title, html, payload, variant) {
    const directory = settings.createTargetSubfolders
        ? path.join(stagingDirectory, profile.directory)
        : stagingDirectory;
    fs.mkdirSync(directory, { recursive: true });
    if (!profile.zip) {
        const fileName = withTitle(title, profile.outputBaseName, 'html');
        fs.writeFileSync(path.join(directory, fileName), html, 'utf8');
        return profileRelativePath(profile, settings, fileName);
    }
    const zip = new jszip_1.default();
    let zipHtml = html;
    if (profile.splitResources) {
        const resourceFile = profile.snapchatMode === 'cdn'
            ? `${variant.snapchat.cdnFolder}/res.js`
            : 'res.js';
        zip.file(resourceFile, payloadAssignments(settings.assetEncoding, payload));
        const resourceUrl = profile.snapchatMode === 'cdn'
            ? `${SNAPCHAT_CDN_PREFIX}/${variant.snapchat.cdnFolder}/res.js`
            : resourceFile;
        zipHtml = insertBeforeClosingTag(zipHtml, 'head', `<script src="${resourceUrl}"></script>`);
    }
    zip.file('index.html', zipHtml);
    const config = profile.snapchatMode
        ? (0, settings_2.parseSnapchatConfig)(variant)
        : profile.config;
    if (config) {
        zip.file('config.json', `${JSON.stringify(config, null, 2)}\n`);
    }
    if (profile.thumbnailName) {
        const thumbnailPath = path.join(inputDirectory, profile.thumbnailName);
        if (fs.existsSync(thumbnailPath)) {
            zip.file(profile.thumbnailName, fs.readFileSync(thumbnailPath));
        }
    }
    const output = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
    });
    const fileName = withTitle(title, profile.zipName || profile.outputBaseName, 'zip');
    fs.writeFileSync(path.join(directory, fileName), output);
    return profileRelativePath(profile, settings, fileName);
}
function getOutputDirectory(inputDirectory, variationFolder) {
    const root = path.join(path.dirname(path.resolve(inputDirectory)), constants_1.OUTPUT_DIRECTORY);
    if (!variationFolder)
        return root;
    const safeFolder = (0, settings_1.sanitizeVariationFolder)(variationFolder);
    if (!safeFolder)
        throw new Error('Variation output folder is empty.');
    return path.join(root, safeFolder);
}
exports.getOutputDirectory = getOutputDirectory;
function isRetryableRenameError(error) {
    const code = error === null || error === void 0 ? void 0 : error.code;
    return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
}
function pause(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
async function renameWithRetry(source, destination) {
    const deadline = Date.now() + 10000;
    let attempt = 0;
    while (true) {
        try {
            fs.renameSync(source, destination);
            return;
        }
        catch (error) {
            if (!isRetryableRenameError(error) || Date.now() >= deadline)
                throw error;
            attempt += 1;
            await pause(Math.min(100 * attempt, 1000));
        }
    }
}
async function atomicPromote(stagingDirectory, outputDirectory) {
    const stagingFiles = listOutputFiles(stagingDirectory);
    if (!fs.existsSync(outputDirectory)) {
        fs.mkdirSync(path.dirname(outputDirectory), { recursive: true });
        await renameWithRetry(stagingDirectory, outputDirectory);
        return stagingFiles.map((file) => path.relative(stagingDirectory, file));
    }
    const backupDirectory = path.join(path.dirname(outputDirectory), `${path.basename(outputDirectory)}.cgb-backup-${process.pid}-${Date.now()}`);
    const changes = [];
    const promotedFiles = [];
    try {
        for (const source of stagingFiles) {
            const relative = path.relative(stagingDirectory, source);
            const destination = path.join(outputDirectory, relative);
            promotedFiles.push(relative);
            if (fs.existsSync(destination) && filesEqual(source, destination))
                continue;
            const change = { destination, installed: false };
            if (fs.existsSync(destination)) {
                change.backup = path.join(backupDirectory, relative);
                fs.mkdirSync(path.dirname(change.backup), { recursive: true });
                await renameWithRetry(destination, change.backup);
            }
            changes.push(change);
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            await renameWithRetry(source, destination);
            change.installed = true;
        }
        fs.rmSync(stagingDirectory, { recursive: true, force: true });
        fs.rmSync(backupDirectory, { recursive: true, force: true });
        return promotedFiles;
    }
    catch (error) {
        for (const change of changes.reverse()) {
            try {
                if (change.installed && fs.existsSync(change.destination)) {
                    fs.rmSync(change.destination, { force: true });
                }
                if (change.backup && fs.existsSync(change.backup)) {
                    fs.mkdirSync(path.dirname(change.destination), { recursive: true });
                    await renameWithRetry(change.backup, change.destination);
                }
            }
            catch (rollbackError) {
                console.warn(`[CGB Studio packer] Could not roll back ${change.destination}.`, rollbackError);
            }
        }
        try {
            fs.rmSync(backupDirectory, { recursive: true, force: true });
        }
        catch (backupError) {
            console.warn(`[CGB Studio packer] Could not remove ${backupDirectory}.`, backupError);
        }
        throw error;
    }
}
exports.atomicPromote = atomicPromote;
function listOutputFiles(directory) {
    const files = [];
    const visit = (current) => {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const absolute = path.join(current, entry.name);
            if (entry.isDirectory())
                visit(absolute);
            else if (entry.isFile())
                files.push(absolute);
        }
    };
    visit(directory);
    return files.sort();
}
function filesEqual(first, second) {
    const firstStat = fs.statSync(first);
    const secondStat = fs.statSync(second);
    if (firstStat.size !== secondStat.size)
        return false;
    return fs.readFileSync(first).equals(fs.readFileSync(second));
}
async function packDirectory(inputDirectory, settings, inputOptions) {
    const options = typeof inputOptions === 'string'
        ? { variationFolder: inputOptions }
        : inputOptions || {};
    const variationFolder = options.variationFolder;
    const overrides = options.projectPath
        ? (0, dev_overrides_1.loadDeveloperOverrides)(options.projectPath)
        : { schemaVersion: 1, adapters: {}, profiles: {} };
    const variant = settings.variants.find((item) => item.id === options.variantId)
        || settings.variants.find((item) => item.id === settings.activeVariantId)
        || settings.variants[0];
    if (!variant)
        throw new Error('A CGB variation is required for packing.');
    if (settings.networks.snapchat)
        (0, settings_2.validateSnapchatSettings)(variant);
    const input = path.resolve(inputDirectory);
    const outputDirectory = getOutputDirectory(input, variationFolder);
    const outputRoot = getOutputDirectory(input);
    const stagingRoot = path.join(path.dirname(outputRoot), `${path.basename(outputRoot)}.cgb-staging-${process.pid}-${Date.now()}`);
    const stagingDirectory = variationFolder
        ? path.join(stagingRoot, (0, settings_1.sanitizeVariationFolder)(variationFolder))
        : stagingRoot;
    fs.mkdirSync(stagingDirectory, { recursive: true });
    try {
        const collector = new resources_1.ResourceCollector(input, settings.obfuscate);
        collector.collect();
        applyPackedSplashOverride(collector, options.projectPath, variant);
        const shell = (0, html_1.createHtmlShell)(input, collector);
        const storeUrls = collector.getDetectedStoreUrls(activeSceneComponentTypes(options.projectPath, variant));
        const [storedArchive, compressedArchive] = await Promise.all([
            collector.createArchive(false),
            collector.createArchive(true),
        ]);
        const payloads = {
            stored: encodePayload(storedArchive, settings.assetEncoding),
            compressed: encodePayload(compressedArchive, settings.assetEncoding),
        };
        const jsZipSource = fs.readFileSync(require.resolve('jszip/dist/jszip.min.js'), 'utf8');
        const enabledProfiles = (0, dev_overrides_1.getEffectiveProfiles)(overrides).filter((item) => !item.networkId || settings.networks[item.networkId]);
        (0, dev_overrides_1.validateEffectiveProfileOutputs)(enabledProfiles, settings.createTargetSubfolders);
        for (const profile of enabledProfiles) {
            assertProfileContract(profile);
            const payload = profile.compressed ? payloads.compressed : payloads.stored;
            const html = makeHtml(shell.html, profile, settings, payload, jsZipSource, shell.startup, shell.stylesheets, !profile.splitResources, storeUrls, overrides);
            await writeProfile(stagingDirectory, input, profile, settings, variant.name, html, payload, variant);
        }
        const promotedFiles = await atomicPromote(stagingDirectory, outputDirectory);
        if (variationFolder) {
            fs.rmSync(stagingRoot, { recursive: true, force: true });
        }
        return { inputDirectory: input, outputDirectory, files: promotedFiles };
    }
    catch (error) {
        try {
            fs.rmSync(stagingRoot, { recursive: true, force: true });
        }
        catch (cleanupError) {
            console.warn(`[CGB Studio packer] Could not remove failed staging directory: ${stagingRoot}`, cleanupError);
        }
        throw error;
    }
}
exports.packDirectory = packDirectory;
