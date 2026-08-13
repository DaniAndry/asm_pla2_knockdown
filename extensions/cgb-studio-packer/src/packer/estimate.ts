import * as fs from 'fs';
import * as path from 'path';
import {
  getEffectiveProfiles,
  loadDeveloperOverrides,
  validateEffectiveProfileOutputs,
} from '../networks/dev-overrides';
import { PackerSettings, SizeEstimateCategory } from '../types';
import { createHtmlShell } from './html';
import { encodePayload, makeHtml } from './packer';
import { CollectedResourceReport, ResourceCollector } from './resources';
import { applySplashOverride, baseSplashSettings } from '../splash';

export interface DefaultAnalysis {
  base64Bytes: number;
  base122Bytes: number;
  categories: SizeEstimateCategory[];
}

const CATEGORY_LABELS: Record<string, string> = {
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

function resourceCategory(resource: CollectedResourceReport): string {
  const value = resource.path.toLowerCase().replace(/\\/g, '/');
  const extension = path.posix.extname(value);
  if (
    extension === '.wasm'
    || value.endsWith('.wasm.br')
    || value.endsWith('.asm.js')
    || value.includes('/wasm/')
  ) return 'native';
  if (
    value.startsWith('cocos-js/')
    || /^src\/(?:system|polyfills)\.bundle\.js$/.test(value)
    || /(?:^|\/)cc(?:\.min)?\.js$/.test(value)
  ) return 'engine';
  if (['.bin', '.cconb'].includes(extension)) return 'models';
  if (['.webp', '.png', '.jpg', '.jpeg', '.ktx', '.ktx2', '.pvr', '.astc'].includes(extension)) {
    return 'textures';
  }
  if (['.mp3', '.ogg', '.wav', '.m4a', '.aac'].includes(extension)) return 'audio';
  if (['.ttf', '.otf', '.woff', '.woff2', '.eot', '.ttc'].includes(extension)) return 'fonts';
  if (extension === '.js' || extension === '.mjs') return 'scripts';
  if (
    ['.json', '.ccon', '.scene', '.prefab', '.plist', '.atlas', '.fnt'].includes(extension)
    || value.includes('/config.')
  ) return 'data';
  return 'other';
}

function centralDirectoryCompressedSizes(archive: Buffer): Map<string, number> {
  const minimum = Math.max(0, archive.length - 65_557);
  let end = archive.length - 22;
  while (end >= minimum && archive.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < minimum) throw new Error('Could not find the ZIP end-of-central-directory record.');
  const entries = archive.readUInt16LE(end + 10);
  let offset = archive.readUInt32LE(end + 16);
  const output = new Map<string, number>();
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

function distributeEncodedBytes(
  categories: Map<string, SizeEstimateCategory>,
  archiveBytes: number,
  encodedBytes: number,
  key: 'base64Bytes' | 'base122Bytes',
): void {
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

export async function analyzeDefault(
  inputDirectory: string,
  settings: PackerSettings,
  projectPath?: string,
): Promise<DefaultAnalysis> {
  const overrides = projectPath
    ? loadDeveloperOverrides(projectPath)
    : { schemaVersion: 1, adapters: {}, profiles: {} } as const;
  const profile = getEffectiveProfiles(overrides).find((item) => item.key === 'default');
  if (!profile) throw new Error('The Default output profile is unavailable.');
  validateEffectiveProfileOutputs([profile], true);
  const collector = new ResourceCollector(path.resolve(inputDirectory), settings.obfuscate);
  collector.collect();
  const variant = settings.variants.find((item) => item.id === settings.activeVariantId)
    || settings.variants[0];
  if (projectPath && variant?.splash.mode === 'override') {
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
  const shell = createHtmlShell(inputDirectory, collector);
  const archive = await collector.createArchive(profile.compressed);
  const compressedByPath = centralDirectoryCompressedSizes(archive);
  const categories = new Map<string, SizeEstimateCategory>();
  const ensure = (id: string): SizeEstimateCategory => {
    const existing = categories.get(id);
    if (existing) return existing;
    const created: SizeEstimateCategory = {
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
  const totals: Record<'base64' | 'base122', number> = { base64: 0, base122: 0 };
  const payloadBytes: Record<'base64' | 'base122', number> = { base64: 0, base122: 0 };
  for (const encoding of ['base64', 'base122'] as const) {
    const encodedSettings: PackerSettings = { ...settings, assetEncoding: encoding };
    const payload = encodePayload(archive, encoding);
    let html = makeHtml(
      shell.html,
      profile,
      encodedSettings,
      payload,
      jsZipSource,
      shell.startup,
      shell.stylesheets,
      !profile.splitResources,
      {},
      overrides,
    );
    if (profile.splitResources) {
      html = html.replace(/<\/head>/i, '<script src="res.js"></script>\n</head>');
    }
    totals[encoding] = Buffer.byteLength(html, 'utf8');
    payloadBytes[encoding] = profile.splitResources ? 0 : Buffer.byteLength(payload, 'utf8');
  }

  distributeEncodedBytes(categories, archive.length, payloadBytes.base64, 'base64Bytes');
  distributeEncodedBytes(categories, archive.length, payloadBytes.base122, 'base122Bytes');
  const runtime = ensure('runtime');
  runtime.rawBytes = Math.max(
    totals.base64 - payloadBytes.base64,
    totals.base122 - payloadBytes.base122,
  );
  runtime.base64Bytes = totals.base64 - payloadBytes.base64;
  runtime.base122Bytes = totals.base122 - payloadBytes.base122;

  return {
    base64Bytes: totals.base64,
    base122Bytes: totals.base122,
    categories: Array.from(categories.values())
      .filter((category) => category.rawBytes || category.compressedBytes
        || category.base64Bytes || category.base122Bytes)
      .sort((first, second) =>
        Math.max(second.base64Bytes, second.base122Bytes)
        - Math.max(first.base64Bytes, first.base122Bytes)),
  };
}

/** @deprecated Kept for API compatibility with 1.3/1.4 tests and integrations. */
export const analyzeCommonMin = analyzeDefault;
