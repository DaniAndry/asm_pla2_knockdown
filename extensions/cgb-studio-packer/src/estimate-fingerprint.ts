import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { EXTENSION_VERSION } from './builder-tasks';
import { BuildVariantSettings, PackerSettings } from './types';
import { defaultOverrideFingerprint, loadDeveloperOverrides } from './networks/dev-overrides';

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => ![
        'id',
        'taskId',
        'baseTaskId',
        'nativeTaskId',
        'logDest',
        'buildPath',
        'outputName',
        'sizeEstimate',
        'estimateRunId',
        'selected',
        'snapchat',
      ].includes(key))
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function stableBuilderOptions(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return stableValue(value);
  const options = { ...(value as Record<string, unknown>) };
  if (options.packages && typeof options.packages === 'object' && !Array.isArray(options.packages)) {
    const packages = { ...(options.packages as Record<string, unknown>) };
    delete packages['cgb-studio-packer'];
    if (Object.keys(packages).length) options.packages = packages;
    else delete options.packages;
  }
  return stableValue(options);
}

function metadataSnapshot(root: string, directoryName: string): string[] {
  const directory = path.join(root, directoryName);
  if (!fs.existsSync(directory)) return [];
  const output: string[] = [];
  const visit = (current: string): void => {
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((first, second) => first.name.localeCompare(second.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        const stat = fs.statSync(absolute);
        output.push([
          path.relative(root, absolute).replace(/\\/g, '/'),
          stat.size,
          Math.trunc(stat.mtimeMs),
        ].join(':'));
      }
    }
  };
  visit(directory);
  return output;
}

function settingsContents(root: string): Array<{ path: string; contents: string }> {
  return [
    'settings/v2/packages/engine.json',
    'settings/v2/packages/builder.json',
    'package.json',
  ].flatMap((relative) => {
    const absolute = path.join(root, relative);
    return fs.existsSync(absolute)
      ? [{ path: relative, contents: fs.readFileSync(absolute, 'utf8') }]
      : [];
  });
}

export function createEstimateFingerprint(
  projectPath: string,
  creatorVersion: string,
  builderOptions: unknown,
  settings: PackerSettings,
  variant: BuildVariantSettings,
  environment?: EstimateFingerprintEnvironment,
): string {
  const resolvedEnvironment = environment
    || createEstimateFingerprintEnvironment(projectPath, creatorVersion);
  const source = {
    extensionVersion: EXTENSION_VERSION,
    ...resolvedEnvironment,
    builderOptions: stableBuilderOptions(builderOptions),
    buildDefaults: stableValue(settings.buildDefaults),
    obfuscate: settings.obfuscate,
    defaultOverride: defaultOverrideFingerprint(loadDeveloperOverrides(projectPath)),
    variant: stableValue(variant),
  };
  return crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex');
}

export interface EstimateFingerprintEnvironment {
  creatorVersion: string;
  settingsFiles: Array<{ path: string; contents: string }>;
  projectFiles: string[];
}

export function createEstimateFingerprintEnvironment(
  projectPath: string,
  creatorVersion: string,
): EstimateFingerprintEnvironment {
  return {
    creatorVersion,
    settingsFiles: settingsContents(projectPath),
    projectFiles: [
      ...metadataSnapshot(projectPath, 'assets'),
      ...metadataSnapshot(projectPath, 'build-templates'),
    ],
  };
}
