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
Object.defineProperty(exports, "__esModule", { value: true });
exports.installAdsManager = exports.getAdsManagerSource = exports.getAdsManagerPath = exports.ADS_MANAGER_RELATIVE_PATH = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
exports.ADS_MANAGER_RELATIVE_PATH = path.join('assets', 'Scripts', 'CGB', 'AdsManager.ts');
function getAdsManagerPath(projectPath) {
    return path.join(projectPath, exports.ADS_MANAGER_RELATIVE_PATH);
}
exports.getAdsManagerPath = getAdsManagerPath;
/**
 * Project-facing module deliberately has no Cocos or DOM imports. It can be
 * imported from any gameplay script and safely becomes a no-op in non-playable
 * builds where the generated HTML bridge is absent.
 */
function getAdsManagerSource() {
    return `/**
 * CGB Studio packer playable API.
 *
 * Import this singleton from gameplay code:
 *
 *   import AdsManager from './CGB/AdsManager';
 *   AdsManager.download();
 *   AdsManager.gameEnd();
 *
 * The generated playable provides the implementation. Calls are safe no-ops
 * in Editor preview and non-playable builds.
 */

interface CgbPlayableApi {
  download?: (url?: string) => void;
  gameEnd?: () => void;
  gameReady?: () => void;
  isDownloadHidden?: () => boolean;
  setGooglePlayUrl?: (url: string) => void;
  setAppStoreUrl?: (url: string) => void;
  game_end?: () => void;
  game_ready?: () => void;
  is_hide_download?: () => boolean;
  set_google_play_url?: (url: string) => void;
  set_app_store_url?: (url: string) => void;
  google_play_url?: string;
  appstore_url?: string;
}

type CgbGlobal = typeof globalThis & {
  cgb?: CgbPlayableApi;
  super_html?: CgbPlayableApi;
  super_html_playable?: CgbPlayableApi;
};

function api(): CgbPlayableApi | undefined {
  const root = globalThis as CgbGlobal;
  return root.cgb || root.super_html || root.super_html_playable;
}

class AdsManager {
  download(url?: string): void {
    api()?.download?.(url);
  }

  gameEnd(): void {
    const bridge = api();
    if (bridge?.gameEnd) bridge.gameEnd();
    else bridge?.game_end?.();
  }

  gameReady(): void {
    const bridge = api();
    if (bridge?.gameReady) bridge.gameReady();
    else bridge?.game_ready?.();
  }

  isDownloadHidden(): boolean {
    const bridge = api();
    if (bridge?.isDownloadHidden) return Boolean(bridge.isDownloadHidden());
    return Boolean(bridge?.is_hide_download?.());
  }

  setGooglePlayUrl(url: string): void {
    const bridge = api();
    if (bridge?.setGooglePlayUrl) bridge.setGooglePlayUrl(url);
    else if (bridge?.set_google_play_url) bridge.set_google_play_url(url);
    else if (bridge) bridge.google_play_url = url;
  }

  setAppStoreUrl(url: string): void {
    const bridge = api();
    if (bridge?.setAppStoreUrl) bridge.setAppStoreUrl(url);
    else if (bridge?.set_app_store_url) bridge.set_app_store_url(url);
    else if (bridge) bridge.appstore_url = url;
  }
}

export default new AdsManager();
`;
}
exports.getAdsManagerSource = getAdsManagerSource;
function installAdsManager(projectPath) {
    const output = getAdsManagerPath(projectPath);
    if (fs.existsSync(output)) {
        return { path: output, installed: true, created: false };
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const temporary = `${output}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temporary, getAdsManagerSource(), 'utf8');
    fs.renameSync(temporary, output);
    return { path: output, installed: true, created: true };
}
exports.installAdsManager = installAdsManager;
