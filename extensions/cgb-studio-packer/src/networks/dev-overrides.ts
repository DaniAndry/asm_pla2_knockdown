import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { NETWORK_OVERRIDES_FILE } from '../constants';
import { ADAPTERS, createUnityAdapterScript, NetworkAdapter } from './adapters';
import { OUTPUT_PROFILES, OutputProfile } from './profiles';

type TextPatch = { prepend?: string; replace?: string; append?: string };

export interface DeveloperOverrides {
  schemaVersion: 1;
  adapters: Record<string, { headHtml?: TextPatch; script?: TextPatch }>;
  profiles: Record<string, Partial<Pick<OutputProfile,
    'directory' | 'outputBaseName' | 'compressed' | 'zip' | 'splitResources'
    | 'zipName' | 'metaHtml' | 'config' | 'thumbnailName'>>>;
}

const ADAPTER_KEYS = ['default', ...Object.keys(ADAPTERS).filter((key) => key !== 'common')];
const PROFILE_KEYS = OUTPUT_PROFILES.map((profile) => profile.key);
const TEXT_PATCH_KEYS = new Set(['prepend', 'replace', 'append']);
const PROFILE_FIELDS = new Set([
  'directory', 'outputBaseName', 'compressed', 'zip', 'splitResources',
  'zipName', 'metaHtml', 'config', 'thumbnailName',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}

function validateJsonValue(value: unknown, location: string, seen = new Set<unknown>()): void {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value === 'function' || typeof value === 'undefined' || typeof value === 'symbol') {
    throw new Error(`${location} must contain only JSON-compatible values and strings.`);
  }
  if (typeof value !== 'object') throw new Error(`${location} contains an unsupported value.`);
  if (seen.has(value)) throw new Error(`${location} contains a cyclic reference.`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateJsonValue(item, `${location}[${index}]`, seen));
  } else {
    if (!isPlainObject(value)) throw new Error(`${location} must be a plain object.`);
    for (const [key, item] of Object.entries(value)) {
      validateJsonValue(item, `${location}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function validateTextPatch(value: unknown, location: string): TextPatch {
  if (!isPlainObject(value)) throw new Error(`${location} must be a text patch object.`);
  for (const key of Object.keys(value)) {
    if (!TEXT_PATCH_KEYS.has(key)) throw new Error(`${location}.${key} is not supported.`);
    if (typeof value[key] !== 'string') throw new Error(`${location}.${key} must be a string.`);
  }
  return value as TextPatch;
}

function safeOutputPart(
  value: string,
  location: string,
  allowEmpty = false,
  allowNested = false,
): void {
  if (allowEmpty && !value) return;
  const segments = value.replace(/\\/g, '/').split('/');
  if (!value || path.isAbsolute(value) || (!allowNested && segments.length !== 1)
    || segments.some((segment) => !segment || segment === '.' || segment === '..'
      || /[<>:"|?*\u0000-\u001F]/.test(segment))) {
    throw new Error(`${location} must stay inside the output variation and use safe relative path segments.`);
  }
}

export function getDeveloperOverridesPath(projectPath: string): string {
  return path.join(projectPath, 'settings', NETWORK_OVERRIDES_FILE);
}

function createLegacyDeveloperOverridesTemplate(): string {
  const adapterLines = ADAPTER_KEYS.map((key) => `    ${JSON.stringify(key)}: {},`).join('\n');
  const profileLines = PROFILE_KEYS.map((key) => `    ${JSON.stringify(key)}: {},`).join('\n');
  return `/**
 * CGB Studio packer project overrides.
 * This file is read before every pack and is never overwritten by the extension.
 * Text fields accept { prepend, replace, append }. Profile identity and lifecycle
 * fields are intentionally unavailable. Adapter fields: headHtml, script.
 * Profile fields: directory, outputBaseName, compressed, zip, splitResources,
 * zipName, metaHtml, config, thumbnailName. Paths must remain inside the output
 * variation. Delete unused entries or leave them as empty objects.
 */
module.exports = {
  schemaVersion: 1,
  adapters: {
${adapterLines}
    // applovin: {
    //   headHtml: { append: '' },
    //   script: { append: '\\n// Custom AppLovin code\\n' },
    // },
  },
  profiles: {
${profileLines}
    // applovin: { compressed: true, directory: 'applovin', outputBaseName: 'applovin' },
  },
};
`;
}

function commentedRawString(value: string, indentation: string): string {
  const escaped = value
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
  return escaped.split('\n')
    .map((line) => `${indentation}// ${line}`)
    .join('\n');
}

function adapterTemplate(key: string): string {
  const adapter = key === 'default'
    ? ADAPTERS.common
    : ADAPTERS[key as keyof typeof ADAPTERS];
  const headHtml = adapter.headHtml || '';
  const script = key === 'unity'
    ? createUnityAdapterScript({
      googlePlayUrl: '<Google Play URL detected at pack time>',
      appStoreUrl: '<App Store URL detected at pack time>',
    })
    : adapter.script;
  const dynamicNote = key === 'unity'
    ? '\n      // Unity store URL placeholders below are replaced with detected URLs during packing.'
    : '';
  return `    ${JSON.stringify(key)}: {
      // Built-in adapter: ${adapter.label}
      // Protocol: ${adapter.mraid ? `MRAID (${adapter.mraid})` : 'network-specific/browser'}.${dynamicNote}
      headHtml: {
        prepend: '',
        // Uncomment replace (including every commented source line) to take
        // full ownership of the built-in <head> fragment.
        // replace: String.raw\`
${commentedRawString(headHtml, '        ')}
        // \`,
        append: '',
      },
      script: {
        prepend: '',
        // Uncomment replace (including every commented source line) to take
        // full ownership of this network adapter. Mandatory assertions still apply.
        // replace: String.raw\`
${commentedRawString(script, '        ')}
        // \`,
        append: '',
      },
    },`;
}

const PROFILE_TEMPLATE_FIELDS = [
  'directory', 'outputBaseName', 'compressed', 'zip', 'splitResources',
  'zipName', 'metaHtml', 'config', 'thumbnailName',
] as const;

function commentedProfileValue(field: string, value: unknown): string {
  const serialized = JSON.stringify(value, null, 2);
  const lines = serialized.split('\n');
  if (lines.length === 1) return `      // ${field}: ${lines[0]},`;
  return [
    `      // ${field}: ${lines[0]}`,
    ...lines.slice(1, -1).map((line) => `      // ${line}`),
    `      // ${lines[lines.length - 1]},`,
  ].join('\n');
}

function profileTemplate(profile: OutputProfile): string {
  const values = PROFILE_TEMPLATE_FIELDS
    .filter((field) => profile[field] !== undefined)
    .map((field) => commentedProfileValue(field, profile[field]))
    .join('\n');
  return `    ${JSON.stringify(profile.key)}: {
      // Built-in profile defaults below are reference values. Uncomment only
      // the fields that this project intentionally overrides.
${values}
    },`;
}

export function createDeveloperOverridesTemplate(): string {
  const adapterLines = ADAPTER_KEYS.map(adapterTemplate).join('\n\n');
  const profileLines = OUTPUT_PROFILES.map(profileTemplate).join('\n\n');
  return `/**
 * CGB Studio packer project-level network overrides.
 *
 * This file is reloaded before every pack. It is safe to commit to source control.
 * Empty prepend/append values are no-ops and keep future built-in fixes enabled.
 * Uncomment a replace block only when the project must own the complete adapter.
 * Uncomment individual profile fields only when they must differ from the shown
 * built-in defaults. Identity fields and the shared MRAID lifecycle are protected.
 *
 * Supported adapter patches: headHtml/script -> prepend, replace, append.
 * Supported profile fields: directory, outputBaseName, compressed, zip,
 * splitResources, zipName, metaHtml, config, thumbnailName.
 */
module.exports = {
  schemaVersion: 1,

  adapters: {
${adapterLines}
  },

  profiles: {
${profileLines}
  },
};
`;
}

export function ensureDeveloperOverridesFile(projectPath: string): { path: string; created: boolean } {
  const filePath = getDeveloperOverridesPath(projectPath);
  if (fs.existsSync(filePath)) {
    const source = fs.readFileSync(filePath, 'utf8');
    if (!source.trim() || source === createLegacyDeveloperOverridesTemplate()) {
      fs.writeFileSync(filePath, createDeveloperOverridesTemplate(), 'utf8');
    }
    return { path: filePath, created: false };
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, createDeveloperOverridesTemplate(), { encoding: 'utf8', flag: 'wx' });
  return { path: filePath, created: true };
}

export function loadDeveloperOverrides(projectPath: string): DeveloperOverrides {
  const filePath = getDeveloperOverridesPath(projectPath);
  if (!fs.existsSync(filePath)) return { schemaVersion: 1, adapters: {}, profiles: {} };
  const source = fs.readFileSync(filePath, 'utf8');
  const sandbox = Object.create(null) as { module: { exports: unknown }; exports: unknown };
  sandbox.module = { exports: {} };
  sandbox.exports = sandbox.module.exports;
  try {
    new vm.Script(source, { filename: filePath }).runInNewContext(sandbox, {
      timeout: 100,
      contextCodeGeneration: { strings: false, wasm: false },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.stack || error.message : String(error);
    throw new Error(`Developer overrides could not be evaluated:\n${detail}`);
  }
  const exported = sandbox.module.exports;
  validateJsonValue(exported, 'module.exports');
  if (!isPlainObject(exported)) throw new Error('Developer overrides must export a plain object.');
  for (const key of Object.keys(exported)) {
    if (!['schemaVersion', 'adapters', 'profiles'].includes(key)) {
      throw new Error(`Developer override root key "${key}" is not supported.`);
    }
  }
  if (exported.schemaVersion !== 1) throw new Error('Developer overrides schemaVersion must equal 1.');
  const adapters = exported.adapters === undefined ? {} : exported.adapters;
  const profiles = exported.profiles === undefined ? {} : exported.profiles;
  if (!isPlainObject(adapters) || !isPlainObject(profiles)) {
    throw new Error('Developer override adapters and profiles must be plain objects.');
  }
  const normalizedAdapters: DeveloperOverrides['adapters'] = {};
  for (const [key, value] of Object.entries(adapters)) {
    if (!ADAPTER_KEYS.includes(key)) throw new Error(`Unknown developer adapter key "${key}".`);
    if (!isPlainObject(value)) throw new Error(`adapters.${key} must be a plain object.`);
    for (const field of Object.keys(value)) {
      if (!['headHtml', 'script'].includes(field)) {
        throw new Error(`adapters.${key}.${field} is not supported.`);
      }
    }
    normalizedAdapters[key] = {
      ...(value.headHtml !== undefined
        ? { headHtml: validateTextPatch(value.headHtml, `adapters.${key}.headHtml`) }
        : {}),
      ...(value.script !== undefined
        ? { script: validateTextPatch(value.script, `adapters.${key}.script`) }
        : {}),
    };
  }
  const normalizedProfiles: DeveloperOverrides['profiles'] = {};
  for (const [key, value] of Object.entries(profiles)) {
    if (!PROFILE_KEYS.includes(key)) throw new Error(`Unknown developer profile key "${key}".`);
    if (!isPlainObject(value)) throw new Error(`profiles.${key} must be a plain object.`);
    for (const field of Object.keys(value)) {
      if (!PROFILE_FIELDS.has(field)) throw new Error(`profiles.${key}.${field} is not supported.`);
    }
    for (const field of ['directory', 'outputBaseName', 'zipName', 'thumbnailName'] as const) {
      if (value[field] !== undefined) {
        if (typeof value[field] !== 'string') throw new Error(`profiles.${key}.${field} must be a string.`);
        safeOutputPart(
          value[field] as string,
          `profiles.${key}.${field}`,
          field === 'zipName' || field === 'thumbnailName',
          field === 'directory',
        );
      }
    }
    for (const field of ['compressed', 'zip', 'splitResources'] as const) {
      if (value[field] !== undefined && typeof value[field] !== 'boolean') {
        throw new Error(`profiles.${key}.${field} must be a boolean.`);
      }
    }
    if (value.metaHtml !== undefined && typeof value.metaHtml !== 'string') {
      throw new Error(`profiles.${key}.metaHtml must be a string.`);
    }
    if (value.config !== undefined && !isPlainObject(value.config)) {
      throw new Error(`profiles.${key}.config must be a plain object.`);
    }
    normalizedProfiles[key] = value as DeveloperOverrides['profiles'][string];
  }
  return { schemaVersion: 1, adapters: normalizedAdapters, profiles: normalizedProfiles };
}

function patchText(base: string, patch?: TextPatch): string {
  if (!patch) return base;
  const value = patch.replace !== undefined ? patch.replace : base;
  return `${patch.prepend || ''}${value}${patch.append || ''}`;
}

export function applyAdapterOverride(
  adapter: NetworkAdapter,
  overrides: DeveloperOverrides,
  script = adapter.script,
): NetworkAdapter {
  const key = adapter.id === 'common' ? 'default' : adapter.id;
  const patch = overrides.adapters[key];
  if (!patch) return { ...adapter, script };
  return {
    ...adapter,
    headHtml: patchText(adapter.headHtml || '', patch.headHtml),
    script: patchText(script, patch.script),
  };
}

export function getEffectiveProfiles(overrides: DeveloperOverrides): OutputProfile[] {
  return OUTPUT_PROFILES.map((profile) => {
    const changes = overrides.profiles[profile.key] || {};
    return { ...profile, ...changes, adapter: profile.adapter } as OutputProfile;
  });
}

export function validateEffectiveProfileOutputs(
  profiles: OutputProfile[],
  createTargetSubfolders: boolean,
): void {
  const destinations = new Set<string>();
  for (const profile of profiles) {
    if (profile.splitResources && !profile.zip) {
      throw new Error(`${profile.key}: splitResources requires zip output.`);
    }
    const extension = profile.zip ? 'zip' : 'html';
    const directory = createTargetSubfolders
      ? `${profile.directory.replace(/\\/g, '/').toLowerCase()}/`
      : '';
    const identity = `${directory}${(profile.zipName || profile.outputBaseName).toLowerCase()}.${extension}`;
    if (destinations.has(identity)) throw new Error(`Developer profile overrides create an output collision at ${identity}.`);
    destinations.add(identity);
  }
}

export function defaultOverrideFingerprint(overrides: DeveloperOverrides): string {
  const profile = overrides.profiles.default || {};
  return JSON.stringify({
    adapter: overrides.adapters.default || {},
    profile: {
      ...(profile.compressed !== undefined ? { compressed: profile.compressed } : {}),
      ...(profile.splitResources !== undefined ? { splitResources: profile.splitResources } : {}),
      ...(profile.metaHtml !== undefined ? { metaHtml: profile.metaHtml } : {}),
    },
  });
}
