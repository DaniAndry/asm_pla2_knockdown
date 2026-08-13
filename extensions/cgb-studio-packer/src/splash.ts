import * as fs from 'fs';
import * as path from 'path';
import { CocosSplashSettings, SplashOverride } from './types';

const MAX_SPLASH_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

export const DEFAULT_COCOS_SPLASH: CocosSplashSettings = {
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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function mergeSplash(
  base: CocosSplashSettings,
  override: Partial<CocosSplashSettings> | undefined,
): CocosSplashSettings {
  if (!override) return clone(base);
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

export function baseSplashSettings(...values: unknown[]): CocosSplashSettings {
  let result = clone(DEFAULT_COCOS_SPLASH);
  for (const value of values) {
    if (value && typeof value === 'object') {
      result = mergeSplash(result, value as Partial<CocosSplashSettings>);
    }
  }
  return result;
}

function extensionMime(extension: string): string {
  return extension.toLowerCase() === '.png' ? 'image/png' : 'image/jpeg';
}

export function resolveStoredSplashFile(projectPath: string, storedPath: string): string {
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

function fileDataUri(projectPath: string, storedPath: string): string {
  const absolute = resolveStoredSplashFile(projectPath, storedPath);
  const mime = extensionMime(path.extname(absolute));
  return `data:${mime};base64,${fs.readFileSync(absolute).toString('base64')}`;
}

export function applySplashOverride(
  projectPath: string,
  inherited: CocosSplashSettings,
  override: SplashOverride,
): CocosSplashSettings {
  if (override.mode !== 'override') return clone(inherited);
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

export function copySplashAsset(
  projectPath: string,
  variantId: string,
  kind: 'logo' | 'background',
  sourcePath: string,
): string {
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
  if (!safeVariantId) throw new Error('Variation ID is invalid.');
  const directory = path.join(
    projectPath,
    'settings',
    'cgb-studio-packer-assets',
    'splash',
    safeVariantId,
  );
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `${kind}${extension}`);
  const temporary = `${destination}.tmp-${process.pid}`;
  fs.copyFileSync(source, temporary);
  fs.renameSync(temporary, destination);
  for (const otherExtension of ALLOWED_EXTENSIONS) {
    const other = path.join(directory, `${kind}${otherExtension}`);
    if (other !== destination && fs.existsSync(other)) fs.rmSync(other, { force: true });
  }
  return path.relative(projectPath, destination).replace(/\\/g, '/');
}
