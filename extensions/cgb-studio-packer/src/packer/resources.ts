import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import JavaScriptObfuscator from 'javascript-obfuscator';
import JSZip from 'jszip';
import { lookup as lookupMime } from 'mime-types';
import { ResourceManifest, ResourceManifestEntry } from '../types';

interface CollectedResource {
  path: string;
  mime: string;
  type: 'text' | 'binary';
  value: string | Buffer;
}

export interface CollectedResourceReport {
  path: string;
  archivePath: string;
  mime: string;
  rawBytes: number;
}

export interface DetectedStoreUrls {
  googlePlayUrl?: string;
  appStoreUrl?: string;
}

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

function normalizeRelativePath(value: string): string {
  let normalized = value.replace(/\\/g, '/');
  while (normalized.startsWith('./')) normalized = normalized.slice(2);
  while (normalized.startsWith('/')) normalized = normalized.slice(1);
  return normalized;
}

function listFiles(directory: string): string[] {
  const output: string[] = [];
  const visit = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) output.push(absolute);
    }
  };
  visit(directory);
  return output.sort();
}

function isTextFile(filePath: string, mime: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(extension)
    || mime.startsWith('text/')
    || mime === 'application/javascript'
    || mime === 'application/json'
    || mime === 'application/xml'
    || mime === 'image/svg+xml';
}

function preprocessJavaScript(source: string): string {
  return source
    .replace(/[A-Za-z$0-9]*\.createElement\(\s*['"]script['"]\s*\)/g, '_createLocalJSElement()')
    .replace(/\bnew\s+URL\b/g, 'new _CGB_URL');
}

function obfuscateJavaScript(source: string, filePath: string): string {
  if (
    source.length > 500 * 1024
    || filePath.toLowerCase().includes('.min.')
    || source.includes('/script>')
  ) {
    return source;
  }
  try {
    const fileDigest = crypto.createHash('sha1').update(filePath).digest('hex').slice(0, 10);
    return JavaScriptObfuscator.obfuscate(source, {
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
  } catch (error) {
    console.warn(`[CGB Studio packer] Obfuscation skipped for ${filePath}.`, error);
    return source;
  }
}

export function isProjectScript(filePath: string): boolean {
  const normalized = normalizeRelativePath(filePath).toLowerCase();
  if (normalized.startsWith('assets/internal/')) return false;
  return /^assets\/[^/]+\/index\.js$/.test(normalized)
    || /^src\/chunks\/.+\.js$/.test(normalized);
}

export class ResourceCollector {
  private readonly resources = new Map<string, CollectedResource>();
  private readonly inlineData = new Map<string, string>();
  private readonly storeUrls: DetectedStoreUrls = {};
  private readonly storeUrlsByComponentType = new Map<string, DetectedStoreUrls>();

  constructor(
    private readonly inputDirectory: string,
    private readonly obfuscate: boolean,
  ) {}

  collect(): void {
    for (const absolutePath of listFiles(this.inputDirectory)) {
      const relativePath = normalizeRelativePath(path.relative(this.inputDirectory, absolutePath));
      if (relativePath.toLowerCase() === 'index.html') continue;
      const mime = String(lookupMime(relativePath) || 'application/octet-stream');
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
      } else {
        this.resources.set(relativePath, {
          path: relativePath,
          mime,
          type: 'binary',
          value: buffer,
        });
      }
    }
  }

  processHtmlText(value: string): string {
    this.captureStoreUrls(value);
    return this.extractDataUris(value);
  }

  processInlineScript(value: string): string {
    // Cocos uses the inline script to call System.import(). Obfuscating that
    // bootstrap (or SystemJS/polyfills) can change its method lookup and break
    // the loader before project code starts.
    return preprocessJavaScript(this.extractDataUris(value));
  }

  has(relativePath: string): boolean {
    return this.resources.has(normalizeRelativePath(relativePath));
  }

  getText(relativePath: string): string | undefined {
    const resource = this.resources.get(normalizeRelativePath(relativePath));
    return resource?.type === 'text' ? resource.value as string : undefined;
  }

  replaceText(relativePath: string, value: string): void {
    const normalized = normalizeRelativePath(relativePath);
    const resource = this.resources.get(normalized);
    if (!resource || resource.type !== 'text') {
      throw new Error(`Text resource was not found: ${normalized}`);
    }
    this.captureStoreUrls(value);
    resource.value = this.extractDataUris(value);
  }

  getDetectedStoreUrls(componentTypeIds?: Iterable<string>): DetectedStoreUrls {
    if (componentTypeIds) {
      const scoped: DetectedStoreUrls = {};
      let matched = false;
      for (const typeId of componentTypeIds) {
        const urls = this.storeUrlsByComponentType.get(typeId);
        if (!urls) continue;
        matched = true;
        if (!scoped.googlePlayUrl && urls.googlePlayUrl) scoped.googlePlayUrl = urls.googlePlayUrl;
        if (!scoped.appStoreUrl && urls.appStoreUrl) scoped.appStoreUrl = urls.appStoreUrl;
      }
      // Do not fill a deliberately absent platform URL from another component.
      // NodeHTML_RU, for example, intentionally returns an empty App Store URL.
      if (matched) return scoped;
    }
    return { ...this.storeUrls };
  }

  getReportEntries(): CollectedResourceReport[] {
    return Array.from(this.resources.values()).map((resource, index) => ({
      path: resource.path,
      archivePath: `files/${String(index).padStart(6, '0')}`,
      mime: resource.mime,
      rawBytes: typeof resource.value === 'string'
        ? Buffer.byteLength(resource.value, 'utf8')
        : resource.value.length,
    }));
  }

  async createArchive(compressed: boolean): Promise<Buffer> {
    const zip = new JSZip();
    const entries: ResourceManifestEntry[] = [];
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
    const manifest: ResourceManifest = { schemaVersion: 1, entries };
    zip.file('__cgb_manifest__.json', JSON.stringify(manifest));
    return zip.generateAsync({
      type: 'nodebuffer',
      compression: compressed ? 'DEFLATE' : 'STORE',
      compressionOptions: compressed ? { level: 9 } : undefined,
    });
  }

  private extractDataUris(value: string): string {
    return value.replace(
      /data:([a-z0-9.+-]+\/[a-z0-9.+-]+)(?:;[^,;]+)*;base64,([a-z0-9+/=\s]+)/gi,
      (_match, mimeValue: string, base64Value: string) => {
        const compactBase64 = base64Value.replace(/\s+/g, '');
        const dedupeKey = `${mimeValue}:${compactBase64}`;
        const existing = this.inlineData.get(dedupeKey);
        if (existing) return `cgb://${existing}`;
        const bytes = Buffer.from(compactBase64, 'base64');
        const digest = crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 16);
        const extension = String(mimeValue).split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
        const resourcePath = `__cgb_inline__/${digest}.${extension}`;
        this.inlineData.set(dedupeKey, resourcePath);
        this.resources.set(resourcePath, {
          path: resourcePath,
          mime: mimeValue,
          type: 'binary',
          value: bytes,
        });
        return `cgb://${resourcePath}`;
      },
    );
  }

  private captureComponentStoreUrls(value: string): void {
    const starts = Array.from(value.matchAll(/System\.register\s*\(/g), (match) => match.index || 0);
    for (let index = 0; index < starts.length; index += 1) {
      const source = value.slice(starts[index], starts[index + 1] ?? value.length);
      const ids = Array.from(
        source.matchAll(/\._RF\.push\(\{\},\s*["']([^"']+)["']/g),
        (match) => match[1],
      );
      if (!ids.length) continue;
      const urls: DetectedStoreUrls = {};
      this.captureStoreUrls(source, urls);
      if (!urls.googlePlayUrl && !urls.appStoreUrl) continue;
      for (const id of ids) this.storeUrlsByComponentType.set(id, { ...urls });
    }
  }

  private captureStoreUrls(value: string, output = this.storeUrls): void {
    const normalized = value.replace(/\\\//g, '/');
    for (const match of normalized.matchAll(/https?:\/\/[^\s"'<>\\)\]}]+/gi)) {
      const candidate = match[0].replace(/[.,;:]+$/g, '');
      try {
        const url = new URL(candidate);
        const host = url.hostname.toLowerCase();
        if (
          !output.googlePlayUrl
          && host === 'play.google.com'
          && url.pathname.toLowerCase() === '/store/apps/details'
          && Boolean(url.searchParams.get('id'))
        ) {
          output.googlePlayUrl = url.toString();
        }
        if (
          !output.appStoreUrl
          && (host === 'apps.apple.com' || host === 'itunes.apple.com')
          && /\/id\d+(?:\/|$)/i.test(url.pathname)
        ) {
          output.appStoreUrl = url.toString();
        }
      } catch (error) {}
    }
  }
}

export function normalizeResourcePath(value: string): string {
  return normalizeRelativePath(value.split('?')[0].split('#')[0]);
}
