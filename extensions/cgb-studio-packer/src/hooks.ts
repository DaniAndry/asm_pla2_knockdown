import { PACKAGE_NAME } from './constants';
import { packDirectory } from './packer/packer';
import { loadSettings, normalizeSettings } from './settings';

export const throwError = true;

function projectPath(): string {
  return Editor.Project?.path || Editor.projectPath || process.cwd();
}

function settingsForBuild(options: any) {
  const packageOptions = options?.packages?.[PACKAGE_NAME];
  const settings = packageOptions?.settingsSnapshot
    ? normalizeSettings(packageOptions.settingsSnapshot)
    : loadSettings(projectPath());
  return {
    settings,
    requestedByPanel: packageOptions?.forcePack === true,
    variationFolder: typeof packageOptions?.variationFolder === 'string'
      ? packageOptions.variationFolder
      : undefined,
    variantId: typeof packageOptions?.variantId === 'string'
      ? packageOptions.variantId
      : undefined,
  };
}

export async function onAfterBuild(options: any, result: any): Promise<void> {
  if (options?.platform !== 'web-mobile') return;
  if (options?.packages?.[PACKAGE_NAME]?.estimateOnly === true) return;
  const { settings, requestedByPanel, variationFolder, variantId } = settingsForBuild(options);
  if (!requestedByPanel && !settings.autoPackCocosBuilds) return;

  if (!result?.dest) {
    throw new Error('[CGB Studio packer] Builder result does not contain an output directory.');
  }
  console.log(`[CGB Studio packer] Packing ${result.dest}`);
  const packed = await packDirectory(result.dest, settings, {
    variationFolder: requestedByPanel ? variationFolder : undefined,
    variantId: requestedByPanel ? variantId : settings.activeVariantId,
    projectPath: projectPath(),
  });
  console.log(`[CGB Studio packer] Generated ${packed.files.length} files in ${packed.outputDirectory}`);
}
