import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';
import { GOOGLE_EXIT_API_URL, OUTPUT_DIRECTORY } from '../constants';
import { encodeBase122, safeInlineString } from '../codec/base122';
import { createUnityAdapterScript } from '../networks/adapters';
import {
  applyAdapterOverride,
  DeveloperOverrides,
  getEffectiveProfiles,
  loadDeveloperOverrides,
  validateEffectiveProfileOutputs,
} from '../networks/dev-overrides';
import { createMraidLifecycleScript } from '../networks/mraid-lifecycle';
import { OutputProfile } from '../networks/profiles';
import { sanitizeVariationFolder } from '../settings';
import { parseSnapchatConfig, validateSnapchatSettings } from '../settings';
import { applySplashOverride, baseSplashSettings } from '../splash';
import {
  BuildVariantSettings,
  PackOptions,
  PackResult,
  PackerSettings,
} from '../types';
import { createHtmlShell } from './html';
import { DetectedStoreUrls, ResourceCollector } from './resources';
import { getBrowserRuntimeSource } from './runtime';
import { getPlayableBridgeSource } from './playable-bridge';

function activeSceneComponentTypes(
  projectPath: string | undefined,
  variant: BuildVariantSettings,
): string[] {
  if (!projectPath) return [];
  const scene = variant.scenes.find((item) => item.uuid === variant.startScene);
  if (!scene?.url.startsWith('db://assets/')) return [];
  const absolute = path.join(projectPath, scene.url.slice('db://'.length).replace(/\//g, path.sep));
  if (!fs.existsSync(absolute)) return [];
  try {
    const serialized = JSON.parse(fs.readFileSync(absolute, 'utf8'));
    if (!Array.isArray(serialized)) return [];
    return serialized.flatMap((item) => (
      item && typeof item.__type__ === 'string' && !item.__type__.startsWith('cc.')
        ? [item.__type__]
        : []
    ));
  } catch (error) {
    console.warn(`[CGB Studio packer] Could not inspect start scene ${scene.url}.`, error);
    return [];
  }
}

function applyPackedSplashOverride(
  collector: ResourceCollector,
  projectPath: string | undefined,
  variant: BuildVariantSettings,
): void {
  if (!projectPath || variant.splash.mode !== 'override') return;
  const settingsPath = 'src/settings.json';
  const source = collector.getText(settingsPath);
  if (!source) throw new Error(`Splash override requires ${settingsPath} in the web-mobile build.`);
  const cocosSettings = JSON.parse(source);
  cocosSettings.splashScreen = applySplashOverride(
    projectPath,
    baseSplashSettings(cocosSettings.splashScreen),
    variant.splash,
  );
  collector.replaceText(settingsPath, JSON.stringify(cocosSettings));
}

function safeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function sanitizeFileName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/[.\s]+$/g, '')
    .trim()
    .slice(0, 96);
}

function withTitle(
  title: string,
  baseName: string,
  extension: string,
): string {
  const safeTitle = sanitizeFileName(title)
    .replace(/^Cocos Creator\s*-\s*/i, '');
  return `${safeTitle ? `${safeTitle}%` : ''}${baseName}.${extension}`;
}

export function insertBeforeClosingTag(
  html: string,
  tag: 'head' | 'body',
  content: string,
): string {
  const expression = new RegExp(`</${tag}>`, 'i');
  if (expression.test(html)) {
    // A Base122 payload may contain String.replace tokens such as $&, $` and $'.
    // Returning from a callback inserts the payload literally.
    return html.replace(expression, () => `${content}\n</${tag}>`);
  }
  return `${html}\n${content}`;
}

export function encodePayload(archive: Buffer, encoding: PackerSettings['assetEncoding']): string {
  return encoding === 'base122'
    ? encodeBase122(new Uint8Array(archive.buffer, archive.byteOffset, archive.byteLength))
    : archive.toString('base64');
}

function payloadAssignments(
  encoding: PackerSettings['assetEncoding'],
  payload: string,
): string {
  return [
    `window.__CGB_ENCODING__=${JSON.stringify(encoding)};`,
    `window.__CGB_PAYLOAD__=${safeInlineString(payload)};`,
  ].join('');
}

function assertGoogleHtml(html: string, profile: OutputProfile): void {
  if (profile.networkId !== 'google') return;
  if (!html.includes(GOOGLE_EXIT_API_URL)) {
    throw new Error(`${profile.key}: official Google exitapi.js script is missing.`);
  }
  if (!/\bExitApi\.exit\s*\(\s*\)/.test(html)) {
    throw new Error(`${profile.key}: direct ExitApi.exit() call is missing.`);
  }
  if (/window\.open\s*\([^)]*ExitApi\.exit/.test(html)) {
    throw new Error(`${profile.key}: ExitApi.exit() must not be wrapped in window.open().`);
  }
}

function assertSnapchatHtml(html: string, profile: OutputProfile): void {
  if (profile.networkId !== 'snapchat') return;
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

function assertUnityHtml(html: string, profile: OutputProfile): void {
  if (profile.networkId !== 'unity') return;
  if (!/mraid\.open\(["']https:\/\/(?:play\.google\.com\/store\/apps\/details\?id=|(?:apps|itunes)\.apple\.com\/)/i.test(html)) {
    throw new Error('Unity output does not contain a validator-visible direct store URL call.');
  }
}

function assertLifecycleHtml(html: string, profile: OutputProfile): void {
  if (profile.adapter.mraid === 'standard') {
    if (!/<script\s+src=["']mraid\.js["']><\/script>/i.test(html)) {
      throw new Error(`${profile.key}: standard MRAID target must reference mraid.js.`);
    }
    for (const literal of ['viewableChange', 'exposureChange', 'sizeChange', 'audioVolumeChange', 'orientationchange']) {
      if (!html.includes(literal)) throw new Error(`${profile.key}: shared MRAID lifecycle is missing ${literal}.`);
    }
  } else if (profile.adapter.mraid === 'bigo') {
    if (!html.includes('window.BGY_MRAID')) throw new Error(`${profile.key}: BGY_MRAID lifecycle is missing.`);
  }
}

function assertMintegralHtml(html: string, profile: OutputProfile): void {
  if (profile.networkId !== 'mintegral') return;
  for (const expression of [
    /function\s+gameStart\s*\(/,
    /function\s+gameClose\s*\(/,
    /window\.gameReady\s*\(/,
    /window\.gameStart\s*\(\s*\)/,
    /window\.gameEnd\s*\(\s*\)/,
  ]) {
    if (!expression.test(html)) throw new Error(`${profile.key}: required Mintegral lifecycle callback is missing.`);
  }
}

function assertProfileContract(profile: OutputProfile): void {
  if (profile.networkId === 'snapchat') {
    if (!profile.zip) throw new Error(`${profile.key}: Snapchat output must remain a ZIP.`);
    if (profile.snapchatMode === 'inline' && profile.splitResources) {
      throw new Error(`${profile.key}: Snapchat Ads API ZIP must keep its payload inline.`);
    }
    if (profile.snapchatMode === 'cdn' && !profile.splitResources) {
      throw new Error(`${profile.key}: Snapchat CDN ZIP must keep its res.js resource split.`);
    }
  }
}

export function makeHtml(
  shellHtml: string,
  profile: OutputProfile,
  settings: PackerSettings,
  payload: string,
  jsZipSource: string,
  startup: unknown,
  stylesheets: unknown,
  inlinePayload: boolean,
  storeUrls: DetectedStoreUrls = {},
  overrides: DeveloperOverrides = { schemaVersion: 1, adapters: {}, profiles: {} },
): string {
  let html = shellHtml;
  const generatedScript = profile.networkId === 'unity'
    ? createUnityAdapterScript(storeUrls)
    : profile.adapter.script;
  const adapter = applyAdapterOverride(profile.adapter, overrides, generatedScript);
  const effectiveProfile = { ...profile, adapter };
  const head = [effectiveProfile.metaHtml, adapter.headHtml].filter(Boolean).join('\n');
  if (head) html = insertBeforeClosingTag(html, 'head', head);

  const assignments = inlinePayload ? payloadAssignments(settings.assetEncoding, payload) : '';
  const runtime = [
    '<script type="text/javascript">',
    assignments,
    `window.__CGB_STARTUP__=${safeInlineJson(startup)};`,
    `window.__CGB_STYLESHEETS__=${safeInlineJson(stylesheets)};`,
    `window.super_html_channel=${JSON.stringify(adapter.id)};`,
    jsZipSource,
    getBrowserRuntimeSource(),
    // Network adapter is deliberately injected after resource obfuscation.
    adapter.script,
    // Keep the project-facing super_html_playable.ts contract consistent for every target.
    getPlayableBridgeSource(),
    adapter.mraid
      ? createMraidLifecycleScript(adapter.mraid)
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

const SNAPCHAT_CDN_PREFIX = 'https://rtb-ads.shadow.snapads.com/html5';

function profileRelativePath(
  profile: OutputProfile,
  settings: PackerSettings,
  fileName: string,
): string {
  return settings.createTargetSubfolders
    ? path.join(profile.directory, fileName)
    : fileName;
}

async function writeProfile(
  stagingDirectory: string,
  inputDirectory: string,
  profile: OutputProfile,
  settings: PackerSettings,
  title: string,
  html: string,
  payload: string,
  variant: BuildVariantSettings,
): Promise<string> {
  const directory = settings.createTargetSubfolders
    ? path.join(stagingDirectory, profile.directory)
    : stagingDirectory;
  fs.mkdirSync(directory, { recursive: true });

  if (!profile.zip) {
    const fileName = withTitle(
      title,
      profile.outputBaseName,
      'html',
    );
    fs.writeFileSync(path.join(directory, fileName), html, 'utf8');
    return profileRelativePath(profile, settings, fileName);
  }

  const zip = new JSZip();
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
    ? parseSnapchatConfig(variant)
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
  const fileName = withTitle(
    title,
    profile.zipName || profile.outputBaseName,
    'zip',
  );
  fs.writeFileSync(path.join(directory, fileName), output);
  return profileRelativePath(profile, settings, fileName);
}

export function getOutputDirectory(
  inputDirectory: string,
  variationFolder?: string,
): string {
  const root = path.join(path.dirname(path.resolve(inputDirectory)), OUTPUT_DIRECTORY);
  if (!variationFolder) return root;
  const safeFolder = sanitizeVariationFolder(variationFolder);
  if (!safeFolder) throw new Error('Variation output folder is empty.');
  return path.join(root, safeFolder);
}

function isRetryableRenameError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function renameWithRetry(source: string, destination: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  let attempt = 0;
  while (true) {
    try {
      fs.renameSync(source, destination);
      return;
    } catch (error) {
      if (!isRetryableRenameError(error) || Date.now() >= deadline) throw error;
      attempt += 1;
      await pause(Math.min(100 * attempt, 1_000));
    }
  }
}

export async function atomicPromote(
  stagingDirectory: string,
  outputDirectory: string,
): Promise<string[]> {
  const stagingFiles = listOutputFiles(stagingDirectory);
  if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(path.dirname(outputDirectory), { recursive: true });
    await renameWithRetry(stagingDirectory, outputDirectory);
    return stagingFiles.map((file) => path.relative(stagingDirectory, file));
  }

  const backupDirectory = path.join(
    path.dirname(outputDirectory),
    `${path.basename(outputDirectory)}.cgb-backup-${process.pid}-${Date.now()}`,
  );
  const changes: Array<{
    destination: string;
    backup?: string;
    installed: boolean;
  }> = [];
  const promotedFiles: string[] = [];
  try {
    for (const source of stagingFiles) {
      const relative = path.relative(stagingDirectory, source);
      const destination = path.join(outputDirectory, relative);
      promotedFiles.push(relative);
      if (fs.existsSync(destination) && filesEqual(source, destination)) continue;

      const change: {
        destination: string;
        backup?: string;
        installed: boolean;
      } = { destination, installed: false };
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
  } catch (error) {
    for (const change of changes.reverse()) {
      try {
        if (change.installed && fs.existsSync(change.destination)) {
          fs.rmSync(change.destination, { force: true });
        }
        if (change.backup && fs.existsSync(change.backup)) {
          fs.mkdirSync(path.dirname(change.destination), { recursive: true });
          await renameWithRetry(change.backup, change.destination);
        }
      } catch (rollbackError) {
        console.warn(
          `[CGB Studio packer] Could not roll back ${change.destination}.`,
          rollbackError,
        );
      }
    }
    try {
      fs.rmSync(backupDirectory, { recursive: true, force: true });
    } catch (backupError) {
      console.warn(`[CGB Studio packer] Could not remove ${backupDirectory}.`, backupError);
    }
    throw error;
  }
}

function listOutputFiles(directory: string): string[] {
  const files: string[] = [];
  const visit = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  };
  visit(directory);
  return files.sort();
}

function filesEqual(first: string, second: string): boolean {
  const firstStat = fs.statSync(first);
  const secondStat = fs.statSync(second);
  if (firstStat.size !== secondStat.size) return false;
  return fs.readFileSync(first).equals(fs.readFileSync(second));
}

export async function packDirectory(
  inputDirectory: string,
  settings: PackerSettings,
  inputOptions?: string | PackOptions,
): Promise<PackResult> {
  const options: PackOptions = typeof inputOptions === 'string'
    ? { variationFolder: inputOptions }
    : inputOptions || {};
  const variationFolder = options.variationFolder;
  const overrides = options.projectPath
    ? loadDeveloperOverrides(options.projectPath)
    : { schemaVersion: 1, adapters: {}, profiles: {} } as DeveloperOverrides;
  const variant = settings.variants.find((item) => item.id === options.variantId)
    || settings.variants.find((item) => item.id === settings.activeVariantId)
    || settings.variants[0];
  if (!variant) throw new Error('A CGB variation is required for packing.');
  if (settings.networks.snapchat) validateSnapchatSettings(variant);
  const input = path.resolve(inputDirectory);
  const outputDirectory = getOutputDirectory(input, variationFolder);
  const outputRoot = getOutputDirectory(input);
  const stagingRoot = path.join(
    path.dirname(outputRoot),
    `${path.basename(outputRoot)}.cgb-staging-${process.pid}-${Date.now()}`,
  );
  const stagingDirectory = variationFolder
    ? path.join(stagingRoot, sanitizeVariationFolder(variationFolder))
    : stagingRoot;
  fs.mkdirSync(stagingDirectory, { recursive: true });

  try {
    const collector = new ResourceCollector(input, settings.obfuscate);
    collector.collect();
    applyPackedSplashOverride(collector, options.projectPath, variant);
    const shell = createHtmlShell(input, collector);
    const storeUrls = collector.getDetectedStoreUrls(
      activeSceneComponentTypes(options.projectPath, variant),
    );
    const [storedArchive, compressedArchive] = await Promise.all([
      collector.createArchive(false),
      collector.createArchive(true),
    ]);
    const payloads = {
      stored: encodePayload(storedArchive, settings.assetEncoding),
      compressed: encodePayload(compressedArchive, settings.assetEncoding),
    };
    const jsZipSource = fs.readFileSync(require.resolve('jszip/dist/jszip.min.js'), 'utf8');
    const enabledProfiles = getEffectiveProfiles(overrides).filter(
      (item) => !item.networkId || settings.networks[item.networkId],
    );
    validateEffectiveProfileOutputs(enabledProfiles, settings.createTargetSubfolders);
    for (const profile of enabledProfiles) {
      assertProfileContract(profile);
      const payload = profile.compressed ? payloads.compressed : payloads.stored;
      const html = makeHtml(
        shell.html,
        profile,
        settings,
        payload,
        jsZipSource,
        shell.startup,
        shell.stylesheets,
        !profile.splitResources,
        storeUrls,
        overrides,
      );
      await writeProfile(
        stagingDirectory,
        input,
        profile,
        settings,
        variant.name,
        html,
        payload,
        variant,
      );
    }

    const promotedFiles = await atomicPromote(stagingDirectory, outputDirectory);
    if (variationFolder) {
      fs.rmSync(stagingRoot, { recursive: true, force: true });
    }
    return { inputDirectory: input, outputDirectory, files: promotedFiles };
  } catch (error) {
    try {
      fs.rmSync(stagingRoot, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn(
        `[CGB Studio packer] Could not remove failed staging directory: ${stagingRoot}`,
        cleanupError,
      );
    }
    throw error;
  }
}
