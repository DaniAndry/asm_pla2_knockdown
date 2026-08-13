export const NETWORK_IDS = [
  'default',
  'applovin',
  'ironsource',
  'mraid_universal',
  'ironsource_dapi',
  'mintegral',
  'unity',
  'google',
  'facebook',
  'pangle',
  'liftoff',
  'moloco',
  'tiktok',
  'vungle',
  'bigo',
  'kwai',
  'snapchat',
  'adcolony',
] as const;

export type NetworkId = typeof NETWORK_IDS[number];
export type AssetEncoding = 'base64' | 'base122';
export type NativeCodeBundleMode = 'asmjs' | 'wasm' | 'both';

export interface BuildScene {
  url: string;
  uuid: string;
  name?: string;
}

export interface SplashColor {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface CocosSplashSettings {
  displayRatio: number;
  totalTime: number;
  watermarkLocation:
    | 'default'
    | 'topLeft'
    | 'topRight'
    | 'topCenter'
    | 'bottomLeft'
    | 'bottomCenter'
    | 'bottomRight';
  autoFit: boolean;
  logo?: {
    type: 'default' | 'none' | 'custom';
    image?: string;
    base64?: string;
  };
  background?: {
    type: 'default' | 'color' | 'custom';
    color?: SplashColor;
    image?: string;
    base64?: string;
  };
}

export interface SplashOverride {
  mode: 'inherit' | 'override';
  displayRatio: number;
  logo: {
    type: 'default' | 'none' | 'custom';
    file?: string;
  };
  background: {
    type: 'default' | 'color' | 'custom';
    color: SplashColor;
    file?: string;
  };
}

export interface CommonBuildSettings {
  baseTaskId?: string;
  name: string;
  buildPath: string;
  outputName: string;
  orientation: 'auto' | 'portrait' | 'landscape';
  engineModulesConfigKey: string;
  nativeCodeBundleMode: NativeCodeBundleMode;
}

export interface BuildVariantSettings {
  id: string;
  name: string;
  selected: boolean;
  nativeTaskId?: string;
  scenes: BuildScene[];
  startScene: string;
  splash: SplashOverride;
  snapchat: SnapchatSettings;
  sizeEstimate?: SizeEstimate;
}

export interface SnapchatSettings {
  cdnFolder: string;
  configJson: string;
}

export interface PackerSettings {
  schemaVersion: 6;
  assetEncoding: AssetEncoding;
  obfuscate: boolean;
  autoPackCocosBuilds: boolean;
  createTargetSubfolders: boolean;
  networks: Record<NetworkId, boolean>;
  buildDefaults: CommonBuildSettings;
  variants: BuildVariantSettings[];
  activeVariantId?: string;
  lastManualInput?: string;
}

export interface SizeEstimateCategory {
  id: string;
  label: string;
  rawBytes: number;
  compressedBytes: number;
  base64Bytes: number;
  base122Bytes: number;
}

export interface SizeEstimate {
  calculatedAt: string;
  fingerprint: string;
  sourceOutput: string;
  base64Bytes: number;
  base122Bytes: number;
  categories: SizeEstimateCategory[];
}

export interface SizeEstimateState {
  running: boolean;
  variantId?: string;
  phase?: 'building' | 'analyzing' | 'calculating' | 'publishing' | 'cleanup';
  error?: string;
  warning?: string;
}

export interface AdsManagerState {
  path: string;
  installed: boolean;
}

export interface BuildTaskSettings extends CommonBuildSettings {
  taskId?: string;
  taskName: string;
  scenes: BuildScene[];
  startScene: string;
  useSplashScreen: boolean;
  splashScreen?: CocosSplashSettings;
}

export interface BuildTaskSummary {
  id: string;
  label: string;
  settings: BuildTaskSettings;
}

export interface EngineModuleConfigSummary {
  key: string;
  label: string;
}

export type QueueItemStatus = 'pending' | 'building' | 'success' | 'failure' | 'skipped';

export interface BuildQueueItemState {
  variantId: string;
  name: string;
  status: QueueItemStatus;
  error?: string;
  outputDirectory?: string;
}

export interface BuildQueueState {
  running: boolean;
  currentIndex: number;
  total: number;
  items: BuildQueueItemState[];
}

export interface ResourceManifestEntry {
  path: string;
  archivePath: string;
  mime: string;
  type: 'text' | 'binary';
  size: number;
}

export interface ResourceManifest {
  schemaVersion: 1;
  entries: ResourceManifestEntry[];
}

export interface StartupAction {
  type: 'script' | 'inline';
  value: string;
}

export interface HtmlShell {
  html: string;
  title: string;
  startup: StartupAction[];
  stylesheets: string[];
}

export interface PackResult {
  inputDirectory: string;
  outputDirectory: string;
  files: string[];
}

export interface PackOptions {
  variationFolder?: string;
  variantId?: string;
  projectPath?: string;
}

export interface PanelState {
  version: string;
  settings: PackerSettings;
  buildTasks: BuildTaskSummary[];
  projectScenes: BuildScene[];
  engineModuleConfigs: EngineModuleConfigSummary[];
  outputDirectory: string;
  lastError: string;
  busy: boolean;
  queue: BuildQueueState;
  splashPreviews: Record<string, {
    logo?: string;
    background?: string;
  }>;
  estimateState: SizeEstimateState;
  estimateStale: Record<string, boolean>;
  previewAvailable: boolean;
  adsManager: AdsManagerState;
}
