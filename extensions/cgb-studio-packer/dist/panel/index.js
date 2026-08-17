"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.close = exports.ready = exports.sizeLimitExceeded = exports.SIZE_LIMIT_BYTES = exports.$ = exports.style = exports.template = void 0;
const builder_tasks_1 = require("../builder-tasks");
const constants_1 = require("../constants");
const types_1 = require("../types");
const NETWORK_LABELS = {
    default: 'Default (generic browser)',
    applovin: 'AppLovin',
    ironsource: 'IronSource MRAID',
    mraid_universal: 'MRAID Universal',
    ironsource_dapi: 'IronSource DAPI',
    mintegral: 'Mintegral',
    unity: 'Unity',
    google: 'Google (universal / portrait / landscape)',
    facebook: 'Facebook (HTML / ZIP)',
    pangle: 'Pangle (universal / portrait / landscape)',
    liftoff: 'Liftoff',
    moloco: 'Moloco',
    tiktok: 'TikTok',
    vungle: 'Vungle',
    bigo: 'Bigo',
    kwai: 'Kwai',
    snapchat: 'Snapchat (Ads API / CDN)',
    adcolony: 'AdColony (legacy)',
};
exports.template = `
<div class="root">
  <header>
    <div>
      <h1>CGB Studio packer</h1>
      <p>Variation-aware single HTML web-mobile builds</p>
    </div>
    <span class="version">v${builder_tasks_1.EXTENSION_VERSION}</span>
  </header>

  <main class="workspace">
    <aside class="variant-sidebar">
      <div class="sidebar-title">
        <div>
          <h2>Variations</h2>
          <span class="hint">Build order: top to bottom</span>
        </div>
        <button class="icon add-variant" title="Add variation">+</button>
      </div>
      <div class="variant-list"></div>
      <div class="variant-tools">
        <button class="duplicate-variant">Duplicate</button>
        <button class="delete-variant danger">Delete</button>
        <button class="move-up" title="Move up">↑</button>
        <button class="move-down" title="Move down">↓</button>
      </div>
    </aside>

    <div class="configuration">
      <section>
        <h2>Build configuration</h2>
        <div class="fields">
          <label class="field field-wide"><span>Base native task</span><select class="base-task"></select></label>
          <label class="field"><span>Game name <b class="required" title="Required">*</b></span><input class="game-name" type="text"></label>
          <label class="field"><span>Build path <b class="required" title="Required">*</b></span><input class="build-path" type="text"></label>
          <label class="field"><span>Output name <b class="required" title="Required">*</b></span><input class="output-name" type="text"></label>
          <label class="field"><span>Orientation</span>
            <select class="orientation">
              <option value="auto">Auto</option>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
          <label class="field"><span>Feature Cropping <b class="required" title="Required">*</b></span><select class="engine-config"></select></label>
          <label class="field"><span>Bundle Mode of Native Code</span>
            <select class="native-mode">
              <option value="asmjs">Asmjs</option>
              <option value="wasm">Wasm</option>
              <option value="both">Asmjs + Wasm</option>
            </select>
          </label>
        </div>
        <p class="hint">Debug, source maps, property mangling, MD5 cache, texture-skip and WebGPU are always disabled.</p>
      </section>

      <section class="variant-editor">
        <div class="section-title">
          <h2>Active variation</h2>
          <div class="variant-heading-actions">
            <span class="folder-preview"></span>
            <button class="small estimate-size" title="Runs a full temporary web-mobile build">Estimate size</button>
          </div>
        </div>
        <div class="estimate-summary">
          <div class="estimate-values">
            <div class="estimate-value estimate-base64"><span>Base64</span><strong>--</strong><small></small></div>
            <div class="estimate-value estimate-base122"><span>Base122</span><strong>--</strong><small></small></div>
            <span class="estimate-stale">Outdated</span>
          </div>
          <details class="estimate-details">
            <summary>Details</summary>
            <div class="estimate-table"></div>
            <p class="hint">Category encoding contributions are approximate; total HTML sizes are exact.</p>
          </details>
          <span class="estimate-date hint"></span>
        </div>
        <label class="field field-wide"><span>Variation name <b class="required" title="Required">*</b></span><input class="variant-name" type="text"></label>
        <div class="subheading">Scenes <b class="required" title="Required">*</b></div>
        <div class="scenes"></div>
        <label class="field field-wide"><span>Start Scene <b class="required" title="Required">*</b></span><select class="start-scene"></select></label>

        <div class="subheading splash-heading">Splash Screen</div>
        <label class="field field-wide"><span>Mode</span>
          <select class="splash-mode">
            <option value="inherit">Inherit Cocos settings</option>
            <option value="override">Override for this variation</option>
          </select>
        </label>
        <div class="splash-options">
          <div class="splash-grid">
            <label class="field"><span>Logo</span>
              <select class="logo-type">
                <option value="default">Default</option>
                <option value="none">None</option>
                <option value="custom">Custom image</option>
              </select>
            </label>
            <label class="field"><span>Logo scale</span><input class="logo-scale" type="number" min="0.01" max="10" step="0.05"></label>
            <div class="asset-row logo-asset">
              <img class="asset-preview logo-preview" alt="Logo preview">
              <button class="select-logo">Choose logo…</button><span class="logo-file hint"></span>
            </div>
            <label class="field"><span>Background</span>
              <select class="background-type">
                <option value="default">Default</option>
                <option value="color">Color</option>
                <option value="custom">Custom image</option>
              </select>
            </label>
            <label class="field color-field"><span>Background color</span><input class="background-color" type="color"></label>
            <div class="asset-row background-asset">
              <img class="asset-preview background-preview" alt="Background preview">
              <button class="select-background">Choose background…</button><span class="background-file hint"></span>
            </div>
          </div>
        </div>
      </section>

      <details open>
        <summary>Packer settings</summary>
        <div class="details-body">
          <div class="inline-settings">
            <label><input type="radio" name="encoding" value="base64"> Base64</label>
            <label><input type="radio" name="encoding" value="base122"> Base122 <span class="experimental">experimental</span></label>
            <label><input class="obfuscate" type="checkbox"> Obfuscate project scripts</label>
            <label><input class="auto-pack" type="checkbox"> Auto-pack ordinary Cocos builds</label>
            <label><input class="target-subfolders" type="checkbox"> Create target subfolders</label>
          </div>
          <div class="ads-manager-help">
            <div><strong>Game API</strong><span class="ads-manager-path hint"></span><p class="hint"><code>import AdsManager from './CGB/AdsManager';</code><br><code>AdsManager.download(); AdsManager.gameEnd();</code></p></div>
            <button class="small install-ads-manager">Install AdsManager</button>
          </div>
        </div>
      </details>

      <details>
        <summary>Output targets</summary>
        <div class="details-body">
          <div class="network-actions">
            <span class="hint">Default is an optional generic browser target</span>
            <div><button class="small select-all">Select all</button><button class="small clear-all">Clear all</button></div>
          </div>
          <div class="networks"></div>
          <details class="snapchat-advanced">
            <summary>Snapchat advanced</summary>
            <div class="details-body snapchat-fields">
              <label class="field field-wide"><span>CDN folder <b class="required" title="Required">*</b></span><input class="snapchat-folder" type="text" maxlength="96"></label>
              <label class="field field-wide"><span>config.json <b class="required" title="Required">*</b></span><textarea class="snapchat-config" rows="4" spellcheck="false"></textarea></label>
              <p class="hint">Used only when Snapchat is enabled. Ads API ZIP is self-contained; CDN ZIP uses this folder.</p>
            </div>
          </details>
        </div>
      </details>
    </div>
  </main>

  <div class="status-area">
    <div class="queue-progress"><span class="progress">Ready</span><span class="output"></span></div>
    <div class="queue-details"></div>
    <div class="error-panel">
      <div class="error-toolbar"><strong>Error details</strong><button type="button" class="small copy-error">Copy error</button></div>
      <pre class="error"></pre>
    </div>
  </div>

  <div class="actions">
    <button class="primary build-selected">Build selected</button>
    <button class="primary-secondary build-current">Build current</button>
    <button class="pack-existing">Pack existing…</button>
    <button class="preview">Preview</button>
    <button class="open-output">Open output</button>
    <button class="open-build-settings">Open Build Settings</button>
  </div>
</div>
`;
exports.style = `
:host { display:flex; height:100%; color:var(--color-normal-contrast); }
* { box-sizing:border-box; }
.root { display:flex; flex:1; min-width:720px; min-height:620px; flex-direction:column; overflow:hidden; background:var(--color-normal-fill); }
header { display:flex; align-items:center; justify-content:space-between; padding:16px 18px 12px; border-bottom:1px solid var(--color-normal-border); }
h1,h2,p { margin:0; }
h1 { font-size:20px; font-weight:600; }
h2 { font-size:13px; font-weight:600; }
header p,.hint,.output,.folder-preview { opacity:.65; font-size:11px; }
.version,.experimental { border:1px solid var(--color-warn-border); border-radius:10px; padding:2px 7px; color:var(--color-warn-contrast); font-size:10px; }
.version { cursor: pointer; user-select: none; }
.workspace { display:grid; grid-template-columns:230px minmax(490px,1fr); flex:1; min-height:0; }
.variant-sidebar { display:flex; min-height:0; flex-direction:column; gap:10px; padding:12px; border-right:1px solid var(--color-normal-border); background:var(--color-normal-fill-emphasis); }
.sidebar-title,.section-title,.network-actions { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.variant-heading-actions { display:flex; align-items:center; gap:8px; }
.variant-list { display:flex; flex:1; min-height:100px; flex-direction:column; gap:5px; overflow:auto; }
.variant-item { display:grid; grid-template-columns:22px 1fr auto; align-items:center; min-height:44px; padding:5px 7px; border:1px solid transparent; border-radius:4px; cursor:pointer; }
.variant-item:hover { background:var(--color-hover-fill); }
.variant-item.active { border-color:var(--color-focus-border); background:var(--color-focus-fill); }
.variant-label { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.badge { min-width:10px; font-size:10px; opacity:.75; }
.badge.success { color:#77d48b; }.badge.failure { color:var(--color-danger-contrast); }.badge.building { color:var(--color-warn-contrast); }
.variant-tools { display:grid; grid-template-columns:1fr 1fr 32px 32px; gap:5px; }
.configuration { display:flex; flex-direction:column; gap:10px; overflow:auto; padding:12px 14px 18px; }
section,details { border:1px solid var(--color-normal-border); border-radius:5px; background:var(--color-normal-fill-emphasis); }
section { display:flex; flex-direction:column; gap:9px; padding:12px; }
details summary { padding:10px 12px; cursor:pointer; font-weight:600; font-size:12px; }
.details-body { padding:0 12px 12px; }
.fields,.splash-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 12px; }
.field { display:flex; min-width:0; flex-direction:column; gap:4px; font-size:11px; }
.required { color:var(--color-danger-contrast); font-weight:700; }
.field-wide { grid-column:1/-1; width:100%; }
input[type="text"],input[type="number"],select { width:100%; min-height:27px; border:1px solid var(--color-normal-border); border-radius:3px; padding:3px 7px; color:var(--color-normal-contrast); background:var(--color-normal-fill); }
input[type="color"] { width:100%; min-height:27px; border:1px solid var(--color-normal-border); padding:1px; background:var(--color-normal-fill); }
textarea { width:100%; resize:vertical; border:1px solid var(--color-normal-border); border-radius:3px; padding:6px 7px; color:var(--color-normal-contrast); background:var(--color-normal-fill); font-family:var(--font-monospace); font-size:11px; }
.subheading { margin-top:3px; font-size:11px; font-weight:600; opacity:.85; }
.splash-heading { margin-top:10px; padding:9px 10px; border:1px solid var(--color-focus-border); border-radius:4px; color:var(--color-focus-contrast); background:var(--color-focus-fill); font-size:13px; letter-spacing:.01em; }
.snapchat-advanced { margin-top:10px; }
.snapchat-advanced summary { padding:7px 9px; font-size:11px; font-weight:500; }
.snapchat-advanced .details-body { padding:0 9px 9px; }
.snapchat-fields { display:flex; flex-direction:column; gap:8px; }
.scenes { display:grid; grid-template-columns:1fr 1fr; gap:4px 12px; max-height:124px; overflow:auto; padding:7px; border:1px solid var(--color-normal-border); border-radius:3px; }
.scene,.inline-settings label,.network { display:flex; align-items:center; gap:6px; min-height:23px; }
.asset-row { grid-column:1/-1; display:flex; align-items:center; gap:8px; min-width:0; }
.asset-row span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.asset-preview { width:72px; height:46px; flex:none; border:1px solid var(--color-normal-border); border-radius:3px; object-fit:contain; background:rgba(0,0,0,.18); }
.estimate-summary { display:none; padding:9px; border:1px solid var(--color-normal-border); border-radius:4px; background:var(--color-normal-fill); }
.estimate-summary.visible { display:block; }
.estimate-summary.stale { opacity:.65; }
.estimate-values { display:flex; align-items:stretch; gap:8px; }
.estimate-value { display:grid; grid-template-columns:auto auto; align-items:baseline; gap:2px 8px; min-width:150px; padding:7px 9px; border:1px solid var(--color-normal-border); border-radius:3px; }
.estimate-value span { font-size:11px; opacity:.75; }
.estimate-value strong { font-size:16px; font-variant-numeric:tabular-nums; }
.estimate-value small { grid-column:1/-1; min-height:13px; color:var(--color-danger-contrast); font-size:10px; }
.estimate-value.over-limit { border-color:var(--color-danger-border); color:var(--color-danger-contrast); }
.estimate-stale { display:none; align-self:center; padding:2px 7px; border:1px solid var(--color-warn-border); border-radius:10px; color:var(--color-warn-contrast); font-size:10px; }
.estimate-summary.stale .estimate-stale { display:inline-block; }
.estimate-details { margin-top:8px; }
.estimate-details summary { display:inline-flex; min-height:25px; align-items:center; padding:0 9px; border:1px solid var(--color-normal-border); border-radius:3px; font-size:11px; }
.estimate-table { display:grid; grid-template-columns:minmax(150px,1fr) repeat(4,72px); margin-top:7px; font-size:10px; }
.estimate-cell { padding:5px 6px; border-bottom:1px solid var(--color-normal-border); text-align:right; font-variant-numeric:tabular-nums; }
.estimate-cell.label { text-align:left; }
.estimate-cell.heading { font-weight:600; opacity:.75; }
.estimate-date { display:block; margin-top:6px; }
.inline-settings { display:grid; grid-template-columns:repeat(2,minmax(160px,1fr)); gap:8px 16px; }
.ads-manager-help { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:12px; padding-top:10px; border-top:1px solid var(--color-normal-border); }
.ads-manager-help strong,.ads-manager-path { display:block; font-size:11px; }.ads-manager-path { margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:480px; }.ads-manager-help p { margin-top:5px; line-height:1.55; }.ads-manager-help code { font-family:var(--font-monospace); font-size:10px; }
.networks { display:grid; grid-template-columns:1fr 1fr; gap:6px 14px; margin-top:8px; }
button { min-height:28px; border:1px solid var(--color-normal-border); border-radius:3px; padding:0 9px; color:var(--color-normal-contrast); background:var(--color-normal-fill-emphasis); cursor:pointer; }
button:hover { background:var(--color-hover-fill); }
button:disabled { opacity:.45; cursor:default; }
button.primary { border-color:var(--color-focus-border); color:var(--color-focus-contrast); background:var(--color-focus-fill); }
button.primary-secondary { border-color:var(--color-focus-border); }
button.icon { min-width:28px; padding:0; font-size:18px; }
button.small { min-height:24px; margin-left:5px; font-size:11px; }
button.danger { color:var(--color-danger-contrast); }
.status-area { flex:none; max-height:160px; overflow:auto; padding:8px 14px; border-top:1px solid var(--color-normal-border); }
.queue-progress { display:flex; justify-content:space-between; gap:12px; }
.progress { font-size:12px; }
.output { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.queue-details { display:flex; flex-wrap:wrap; gap:5px 12px; margin-top:5px; font-size:11px; }
.queue-details details { flex:1 1 100%; }
.queue-details details pre { margin:5px 0; padding:6px; white-space:pre-wrap; color:var(--color-danger-contrast); }
.queue-error-toolbar { display:flex; justify-content:flex-end; margin-top:4px; }
.error-panel { display:none; margin:6px 0 0; border:1px solid var(--color-danger-border); border-radius:3px; color:var(--color-danger-contrast); background:var(--color-danger-fill); }
.error-toolbar { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:5px 7px; border-bottom:1px solid var(--color-danger-border); }
.error-toolbar strong { font-size:11px; }
.error { display:none; margin:0; padding:8px; color:inherit; background:transparent; white-space:pre-wrap; font-size:11px; }
.actions { display:grid; grid-template-columns:1.15fr 1.15fr repeat(4,1fr); flex:none; gap:7px; padding:10px 14px 12px; border-top:1px solid var(--color-normal-border); background:var(--color-normal-fill-emphasis); }
@media (max-width:850px) { .workspace { grid-template-columns:200px minmax(480px,1fr); } .actions { grid-template-columns:repeat(3,1fr); } }
`;
exports.$ = {
    root: '.root',
    version: '.version',
    baseTask: '.base-task',
    gameName: '.game-name',
    buildPath: '.build-path',
    outputName: '.output-name',
    orientation: '.orientation',
    engineConfig: '.engine-config',
    nativeMode: '.native-mode',
    variantList: '.variant-list',
    addVariant: '.add-variant',
    duplicateVariant: '.duplicate-variant',
    deleteVariant: '.delete-variant',
    moveUp: '.move-up',
    moveDown: '.move-down',
    variantName: '.variant-name',
    folderPreview: '.folder-preview',
    estimateSize: '.estimate-size',
    estimateSummary: '.estimate-summary',
    estimateBase64: '.estimate-base64',
    estimateBase122: '.estimate-base122',
    estimateDetails: '.estimate-details',
    estimateTable: '.estimate-table',
    estimateDate: '.estimate-date',
    scenes: '.scenes',
    startScene: '.start-scene',
    splashMode: '.splash-mode',
    splashOptions: '.splash-options',
    logoType: '.logo-type',
    logoScale: '.logo-scale',
    logoAsset: '.logo-asset',
    logoPreview: '.logo-preview',
    logoFile: '.logo-file',
    selectLogo: '.select-logo',
    backgroundType: '.background-type',
    backgroundAsset: '.background-asset',
    backgroundPreview: '.background-preview',
    backgroundFile: '.background-file',
    selectBackground: '.select-background',
    colorField: '.color-field',
    backgroundColor: '.background-color',
    snapchatAdvanced: '.snapchat-advanced',
    snapchatFolder: '.snapchat-folder',
    snapchatConfig: '.snapchat-config',
    networks: '.networks',
    obfuscate: '.obfuscate',
    autoPack: '.auto-pack',
    targetSubfolders: '.target-subfolders',
    adsManagerPath: '.ads-manager-path',
    installAdsManager: '.install-ads-manager',
    selectAll: '.select-all',
    clearAll: '.clear-all',
    buildSelected: '.build-selected',
    buildCurrent: '.build-current',
    packExisting: '.pack-existing',
    preview: '.preview',
    openOutput: '.open-output',
    openBuildSettings: '.open-build-settings',
    progress: '.progress',
    output: '.output',
    queueDetails: '.queue-details',
    errorPanel: '.error-panel',
    copyError: '.copy-error',
    error: '.error',
};
let panel;
let state;
let settings;
let busy = false;
let incompatible = false;
let estimateSignatures = {};
let persistQueue = Promise.resolve();
exports.SIZE_LIMIT_BYTES = 5120 * 1024;
function sizeLimitExceeded(bytes) {
    return bytes > exports.SIZE_LIMIT_BYTES;
}
exports.sizeLimitExceeded = sizeLimitExceeded;
function rootElement() {
    const root = panel.$.root;
    if (!root || typeof root.querySelectorAll !== 'function') {
        throw new Error('CGB Studio packer panel root is unavailable.');
    }
    return root;
}
function clearChildren(element) {
    while (element.firstChild)
        element.removeChild(element.firstChild);
}
function activeVariant() {
    const variant = settings.variants.find((item) => item.id === settings.activeVariantId)
        || settings.variants[0];
    if (!variant)
        throw new Error('No CGB variation exists.');
    settings.activeVariantId = variant.id;
    return variant;
}
function newVariantId() {
    const cryptoObject = globalThis.crypto;
    if (typeof (cryptoObject === null || cryptoObject === void 0 ? void 0 : cryptoObject.randomUUID) === 'function')
        return cryptoObject.randomUUID();
    const bytes = new Uint8Array(16);
    if (typeof (cryptoObject === null || cryptoObject === void 0 ? void 0 : cryptoObject.getRandomValues) === 'function') {
        cryptoObject.getRandomValues(bytes);
    }
    else {
        for (let index = 0; index < bytes.length; index += 1) {
            bytes[index] = Math.floor(Math.random() * 256);
        }
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}
function defaultSplash() {
    return {
        mode: 'inherit',
        displayRatio: 1,
        logo: { type: 'default' },
        background: {
            type: 'default',
            color: { x: 0.015686, y: 0.035294, z: 0.039216, w: 1 },
        },
    };
}
function defaultSnapchat() {
    return {
        cdnFolder: newVariantId(),
        configJson: '{}',
    };
}
function sceneName(scene) {
    if (!scene)
        return '';
    return String(scene.name || scene.url.split('/').pop() || '')
        .replace(/\.scene$/i, '');
}
function safeFolder(value) {
    return String(value || '')
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
        .replace(/[.\s]+$/g, '')
        .trim()
        .slice(0, 96);
}
function uniqueVariationName(preferred, excludedId) {
    const existing = new Set(settings.variants
        .filter((variant) => variant.id !== excludedId)
        .map((variant) => safeFolder(variant.name).toLocaleLowerCase()));
    const base = preferred.trim() || 'Variation';
    if (!existing.has(safeFolder(base).toLocaleLowerCase()))
        return base;
    let index = 2;
    while (existing.has(safeFolder(`${base} ${index}`).toLocaleLowerCase()))
        index += 1;
    return `${base} ${index}`;
}
function queueItem(variantId) {
    var _a;
    return (_a = state.queue) === null || _a === void 0 ? void 0 : _a.items.find((item) => item.variantId === variantId);
}
function statusLabel(status) {
    return {
        pending: 'Waiting',
        building: 'Building…',
        success: 'Done',
        failure: 'Failed',
        skipped: 'Skipped',
    }[status || ''] || '';
}
function renderVariants() {
    const container = panel.$.variantList;
    const document = container.ownerDocument;
    clearChildren(container);
    for (const variant of settings.variants) {
        const item = document.createElement('div');
        item.className = `variant-item${variant.id === settings.activeVariantId ? ' active' : ''}`;
        item.onclick = () => {
            settings.activeVariantId = variant.id;
            renderAll();
            void persist();
        };
        const selected = document.createElement('input');
        selected.type = 'checkbox';
        selected.checked = variant.selected;
        selected.title = 'Include in Build selected';
        selected.onclick = (event) => event.stopPropagation();
        selected.onchange = () => {
            variant.selected = selected.checked;
            void persist();
        };
        const label = document.createElement('span');
        label.className = 'variant-label';
        label.textContent = variant.name;
        label.title = variant.name;
        const current = queueItem(variant.id);
        const badge = document.createElement('span');
        badge.className = `badge ${(current === null || current === void 0 ? void 0 : current.status) || ''}`;
        badge.textContent = (current === null || current === void 0 ? void 0 : current.status) === 'success' ? '✓'
            : (current === null || current === void 0 ? void 0 : current.status) === 'failure' ? '!'
                : (current === null || current === void 0 ? void 0 : current.status) === 'building' ? '●' : '';
        badge.title = current ? statusLabel(current.status) : '';
        item.append(selected, label, badge);
        container.appendChild(item);
    }
    const index = settings.variants.findIndex((item) => item.id === activeVariant().id);
    panel.$.deleteVariant.disabled = busy || incompatible || settings.variants.length <= 1;
    panel.$.moveUp.disabled = busy || incompatible || index <= 0;
    panel.$.moveDown.disabled = busy || incompatible || index < 0 || index >= settings.variants.length - 1;
}
function renderSelectOptions(select, values, selected) {
    const document = select.ownerDocument;
    clearChildren(select);
    for (const value of values) {
        const option = document.createElement('option');
        option.value = value.value;
        option.textContent = value.label;
        select.appendChild(option);
    }
    select.value = selected;
}
function renderBuildConfiguration() {
    renderSelectOptions(panel.$.baseTask, [
        { value: '', label: 'Cocos defaults' },
        ...state.buildTasks.map((task) => ({
            value: task.id,
            label: task.label,
        })),
    ], settings.buildDefaults.baseTaskId || '');
    panel.$.gameName.value = settings.buildDefaults.name;
    panel.$.buildPath.value = settings.buildDefaults.buildPath;
    panel.$.outputName.value = settings.buildDefaults.outputName;
    panel.$.orientation.value = settings.buildDefaults.orientation;
    const configs = state.engineModuleConfigs.length
        ? state.engineModuleConfigs
        : [{ key: '', label: 'No Feature Cropping configurations found' }];
    renderSelectOptions(panel.$.engineConfig, configs.map((config) => ({
        value: config.key,
        label: config.label,
    })), settings.buildDefaults.engineModulesConfigKey);
    panel.$.nativeMode.value = settings.buildDefaults.nativeCodeBundleMode;
}
function renderAdsManager() {
    const manager = state.adsManager;
    panel.$.adsManagerPath.textContent = (manager === null || manager === void 0 ? void 0 : manager.installed)
        ? `Installed: ${manager.path}`
        : `Not installed: ${(manager === null || manager === void 0 ? void 0 : manager.path) || 'assets/Scripts/CGB/AdsManager.ts'}`;
    panel.$.installAdsManager.textContent = (manager === null || manager === void 0 ? void 0 : manager.installed) ? 'AdsManager installed' : 'Install AdsManager';
}
function renderStartScenes() {
    const variant = activeVariant();
    renderSelectOptions(panel.$.startScene, variant.scenes.map((scene) => ({ value: scene.uuid, label: sceneName(scene) })), variant.startScene);
}
function renderScenes() {
    const variant = activeVariant();
    const container = panel.$.scenes;
    const document = container.ownerDocument;
    clearChildren(container);
    if (!state.projectScenes.length) {
        const empty = document.createElement('span');
        empty.className = 'hint';
        empty.textContent = 'No scenes found in Assets.';
        container.appendChild(empty);
        renderStartScenes();
        return;
    }
    for (const scene of state.projectScenes) {
        const label = document.createElement('label');
        label.className = 'scene';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = variant.scenes.some((selected) => selected.uuid === scene.uuid);
        input.onchange = () => {
            var _a;
            if (input.checked) {
                if (!variant.scenes.some((selected) => selected.uuid === scene.uuid)) {
                    variant.scenes.push(scene);
                }
            }
            else {
                variant.scenes = variant.scenes.filter((selected) => selected.uuid !== scene.uuid);
            }
            if (!variant.scenes.some((sceneItem) => sceneItem.uuid === variant.startScene)) {
                variant.startScene = ((_a = variant.scenes[0]) === null || _a === void 0 ? void 0 : _a.uuid) || '';
            }
            if (!variant.name.trim() && variant.startScene) {
                variant.name = sceneName(variant.scenes.find((item) => item.uuid === variant.startScene));
            }
            renderStartScenes();
            renderVariants();
            void persist();
        };
        const text = document.createElement('span');
        text.textContent = sceneName(scene);
        label.append(input, text);
        container.appendChild(label);
    }
    renderStartScenes();
}
function componentToByte(value) {
    return Math.max(0, Math.min(255, Math.round(value * 255)));
}
function colorToHex(color) {
    return `#${[color.x, color.y, color.z]
        .map((part) => componentToByte(part).toString(16).padStart(2, '0'))
        .join('')}`;
}
function hexToColor(value, alpha = 1) {
    const normalized = /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : '000000';
    return {
        x: parseInt(normalized.slice(0, 2), 16) / 255,
        y: parseInt(normalized.slice(2, 4), 16) / 255,
        z: parseInt(normalized.slice(4, 6), 16) / 255,
        w: alpha,
    };
}
function integerKb(bytes) {
    return Math.round(bytes / 1024);
}
function formatKb(bytes) {
    return `${integerKb(bytes).toLocaleString('en-US').replace(/,/g, ' ')} KB`;
}
function formatExceededKb(bytes) {
    const value = Math.max(1, Math.ceil(bytes / 1024));
    return `${value.toLocaleString('en-US').replace(/,/g, ' ')} KB`;
}
function renderEstimateValue(element, bytes) {
    const value = element.querySelector('strong');
    const warning = element.querySelector('small');
    value.textContent = formatKb(bytes);
    const over = sizeLimitExceeded(bytes);
    element.classList.toggle('over-limit', over);
    warning.textContent = over
        ? `Exceeds 5 MB by ${formatExceededKb(bytes - exports.SIZE_LIMIT_BYTES)}`
        : '';
}
function renderEstimate() {
    var _a;
    const variant = activeVariant();
    const estimate = variant.sizeEstimate;
    const summary = panel.$.estimateSummary;
    summary.classList.toggle('visible', Boolean(estimate));
    if (!estimate) {
        panel.$.estimateDetails.open = false;
        return;
    }
    const stale = Boolean((_a = state.estimateStale) === null || _a === void 0 ? void 0 : _a[variant.id]);
    summary.classList.toggle('stale', stale);
    renderEstimateValue(panel.$.estimateBase64, estimate.base64Bytes);
    renderEstimateValue(panel.$.estimateBase122, estimate.base122Bytes);
    panel.$.estimateDate.textContent = `${stale ? 'Outdated estimate' : 'Calculated'}: ${new Date(estimate.calculatedAt).toLocaleString()}`;
    const table = panel.$.estimateTable;
    const document = table.ownerDocument;
    clearChildren(table);
    for (const label of ['', 'Raw', 'ZIP', 'Base64', 'Base122']) {
        const cell = document.createElement('div');
        cell.className = `estimate-cell heading${label ? '' : ' label'}`;
        cell.textContent = label;
        table.appendChild(cell);
    }
    for (const category of estimate.categories) {
        const values = [
            category.label,
            formatKb(category.rawBytes),
            formatKb(category.compressedBytes),
            formatKb(category.base64Bytes),
            formatKb(category.base122Bytes),
        ];
        for (let index = 0; index < values.length; index += 1) {
            const cell = document.createElement('div');
            cell.className = `estimate-cell${index === 0 ? ' label' : ''}`;
            cell.textContent = values[index];
            table.appendChild(cell);
        }
    }
}
function renderSplash() {
    var _a;
    const variant = activeVariant();
    const splash = variant.splash;
    const previews = ((_a = state.splashPreviews) === null || _a === void 0 ? void 0 : _a[variant.id]) || {};
    panel.$.splashMode.value = splash.mode;
    panel.$.splashOptions.style.display = splash.mode === 'override' ? 'block' : 'none';
    panel.$.logoType.value = splash.logo.type;
    panel.$.logoScale.value = String(splash.displayRatio);
    panel.$.logoAsset.style.display = splash.logo.type === 'custom' ? 'flex' : 'none';
    panel.$.logoFile.textContent = splash.logo.file || 'No image selected';
    panel.$.logoPreview.src = previews.logo || '';
    panel.$.logoPreview.style.display = previews.logo ? 'block' : 'none';
    panel.$.backgroundType.value = splash.background.type;
    panel.$.backgroundAsset.style.display = splash.background.type === 'custom' ? 'flex' : 'none';
    panel.$.backgroundFile.textContent = splash.background.file || 'No image selected';
    panel.$.backgroundPreview.src = previews.background || '';
    panel.$.backgroundPreview.style.display = previews.background ? 'block' : 'none';
    panel.$.colorField.style.display = splash.background.type === 'color' ? 'flex' : 'none';
    panel.$.backgroundColor.value = colorToHex(splash.background.color);
}
function renderSnapchat() {
    const visible = Boolean(settings.networks.snapchat);
    panel.$.snapchatAdvanced.style.display = visible ? 'block' : 'none';
    const variant = activeVariant();
    panel.$.snapchatFolder.value = variant.snapchat.cdnFolder;
    panel.$.snapchatConfig.value = variant.snapchat.configJson;
}
function renderActiveVariant() {
    const variant = activeVariant();
    panel.$.variantName.value = variant.name;
    panel.$.folderPreview.textContent = `cgb-playable-ready/${safeFolder(variant.name) || '…'}/`;
    renderScenes();
    renderSplash();
    renderSnapchat();
    renderEstimate();
}
function networkCheckboxes() {
    return Array.from(rootElement().querySelectorAll('input[data-network]'));
}
function renderNetworks() {
    const container = panel.$.networks;
    const document = container.ownerDocument;
    clearChildren(container);
    for (const id of types_1.NETWORK_IDS) {
        const label = document.createElement('label');
        label.className = 'network';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.setAttribute('data-network', id);
        input.checked = Boolean(settings.networks[id]);
        input.onchange = () => {
            settings.networks[id] = input.checked;
            if (id === 'snapchat')
                renderSnapchat();
            void persist();
        };
        const text = document.createElement('span');
        text.textContent = NETWORK_LABELS[id];
        label.append(input, text);
        container.appendChild(label);
    }
}
function renderPackerSettings() {
    const encoding = rootElement().querySelector(`input[name="encoding"][value="${settings.assetEncoding}"]`);
    if (encoding)
        encoding.checked = true;
    panel.$.obfuscate.checked = settings.obfuscate;
    panel.$.autoPack.checked = settings.autoPackCocosBuilds;
    panel.$.targetSubfolders.checked = settings.createTargetSubfolders;
    renderNetworks();
}
function renderQueue(queueState = state.queue) {
    state.queue = queueState;
    const completed = queueState.items.filter((item) => item.status === 'success' || item.status === 'failure' || item.status === 'skipped').length;
    if (queueState.running) {
        panel.$.progress.textContent = `Building ${Math.min(queueState.currentIndex + 1, queueState.total)} of ${queueState.total}`;
    }
    else if (queueState.items.length) {
        const successes = queueState.items.filter((item) => item.status === 'success').length;
        const failures = queueState.items.filter((item) => item.status === 'failure').length;
        panel.$.progress.textContent = `Finished: ${successes} successful, ${failures} failed, ${queueState.items.length - successes - failures} skipped`;
    }
    const container = panel.$.queueDetails;
    const document = container.ownerDocument;
    clearChildren(container);
    for (const item of queueState.items) {
        if (item.status === 'failure' && item.error) {
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.textContent = `${item.name}: Failed`;
            const toolbar = document.createElement('div');
            toolbar.className = 'queue-error-toolbar';
            const copy = document.createElement('button');
            copy.type = 'button';
            copy.className = 'small';
            copy.textContent = 'Copy error';
            copy.onclick = () => void copyWithFeedback(item.error || 'Build failed', copy);
            const message = document.createElement('pre');
            message.textContent = item.error;
            toolbar.appendChild(copy);
            details.append(summary, toolbar, message);
            container.appendChild(details);
        }
        else {
            const status = document.createElement('span');
            status.textContent = `${item.name}: ${statusLabel(item.status)}`;
            container.appendChild(status);
        }
    }
    if (queueState.running && completed > 0)
        renderVariants();
}
function renderAll() {
    renderBuildConfiguration();
    renderAdsManager();
    renderVariants();
    renderActiveVariant();
    renderPackerSettings();
    renderQueue();
}
function renderStatus(status, error = '', output = '') {
    panel.$.progress.textContent = status;
    panel.$.output.textContent = output;
    panel.$.error.textContent = error;
    const hasError = Boolean(error);
    panel.$.errorPanel.style.display = hasError ? 'block' : 'none';
    panel.$.error.style.display = hasError ? 'block' : 'none';
    panel.$.copyError.disabled = !hasError;
}
async function writeClipboard(value) {
    var _a, _b;
    const document = panel.$.root.ownerDocument;
    const clipboard = (_b = (_a = document.defaultView) === null || _a === void 0 ? void 0 : _a.navigator) === null || _b === void 0 ? void 0 : _b.clipboard;
    if (clipboard === null || clipboard === void 0 ? void 0 : clipboard.writeText) {
        await clipboard.writeText(value);
        return;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
    textarea.remove();
    if (!copied)
        throw new Error('Clipboard API is unavailable.');
}
async function copyWithFeedback(value, button) {
    if (!value)
        return;
    const original = button.textContent || 'Copy error';
    try {
        await writeClipboard(value);
        button.textContent = 'Copied';
    }
    catch (error) {
        console.error('[CGB Studio packer] Could not copy error details.', error);
        button.textContent = 'Copy failed';
    }
    setTimeout(() => {
        button.textContent = original;
    }, 1500);
}
function setBusy(value) {
    busy = value;
    for (const button of [
        panel.$.addVariant,
        panel.$.duplicateVariant,
        panel.$.deleteVariant,
        panel.$.moveUp,
        panel.$.moveDown,
        panel.$.buildSelected,
        panel.$.buildCurrent,
        panel.$.estimateSize,
        panel.$.packExisting,
        panel.$.preview,
        panel.$.openOutput,
        panel.$.openBuildSettings,
        panel.$.installAdsManager,
    ]) {
        button.disabled = value || incompatible;
    }
    panel.$.preview.disabled = value || incompatible || !(state === null || state === void 0 ? void 0 : state.previewAvailable);
    if (!value && settings)
        renderVariants();
}
function estimateSignature(variant) {
    const { baseTaskId: _baseTaskId, ...buildDefaults } = settings.buildDefaults;
    return JSON.stringify({
        buildDefaults,
        obfuscate: settings.obfuscate,
        variant: {
            id: variant.id,
            name: variant.name,
            scenes: variant.scenes,
            startScene: variant.startScene,
            splash: variant.splash,
        },
    });
}
function captureEstimateSignatures(markChanges) {
    const next = {};
    for (const variant of settings.variants) {
        next[variant.id] = estimateSignature(variant);
        if (markChanges
            && variant.sizeEstimate
            && estimateSignatures[variant.id]
            && estimateSignatures[variant.id] !== next[variant.id]) {
            state.estimateStale[variant.id] = true;
        }
    }
    estimateSignatures = next;
}
async function persist() {
    const snapshot = JSON.parse(JSON.stringify(settings));
    const operation = persistQueue.then(async () => {
        settings = await Editor.Message.request(constants_1.PACKAGE_NAME, 'save-settings', snapshot);
    });
    persistQueue = operation.catch(() => undefined);
    await operation;
    captureEstimateSignatures(true);
    renderAll();
}
function bindCommonText(element, key) {
    element.onchange = async () => {
        settings.buildDefaults[key] = element.value;
        await persist();
    };
}
function addVariant() {
    const firstScene = state.projectScenes[0];
    const name = uniqueVariationName(sceneName(firstScene) || `Variation ${settings.variants.length + 1}`);
    const variant = {
        id: newVariantId(),
        name,
        selected: true,
        scenes: firstScene ? [firstScene] : [],
        startScene: (firstScene === null || firstScene === void 0 ? void 0 : firstScene.uuid) || '',
        splash: defaultSplash(),
        snapchat: defaultSnapchat(),
    };
    settings.variants.push(variant);
    settings.activeVariantId = variant.id;
    renderAll();
    void persist();
}
async function duplicateVariant() {
    const source = activeVariant();
    const copy = JSON.parse(JSON.stringify(source));
    copy.id = newVariantId();
    copy.name = uniqueVariationName(`${source.name} Copy`);
    delete copy.nativeTaskId;
    delete copy.sizeEstimate;
    copy.snapchat.cdnFolder = newVariantId();
    try {
        const assets = await Editor.Message.request(constants_1.PACKAGE_NAME, 'duplicate-splash-assets', {
            targetVariantId: copy.id,
            logoFile: copy.splash.logo.file,
            backgroundFile: copy.splash.background.file,
        });
        if (assets === null || assets === void 0 ? void 0 : assets.logo)
            copy.splash.logo.file = assets.logo;
        if (assets === null || assets === void 0 ? void 0 : assets.background)
            copy.splash.background.file = assets.background;
        state.splashPreviews[copy.id] = (assets === null || assets === void 0 ? void 0 : assets.previews) || {};
    }
    catch (error) {
        const message = error instanceof Error ? error.stack || error.message : String(error);
        renderStatus('Unable to duplicate variation', message, state.outputDirectory || '');
        return;
    }
    const index = settings.variants.indexOf(source);
    settings.variants.splice(index + 1, 0, copy);
    settings.activeVariantId = copy.id;
    renderAll();
    await persist();
}
function deleteVariant() {
    if (settings.variants.length <= 1)
        return;
    const variant = activeVariant();
    const index = settings.variants.indexOf(variant);
    settings.variants.splice(index, 1);
    settings.activeVariantId = settings.variants[Math.min(index, settings.variants.length - 1)].id;
    renderAll();
    void persist();
}
function moveVariant(offset) {
    const variant = activeVariant();
    const index = settings.variants.indexOf(variant);
    const target = index + offset;
    if (target < 0 || target >= settings.variants.length)
        return;
    settings.variants.splice(index, 1);
    settings.variants.splice(target, 0, variant);
    renderAll();
    void persist();
}
async function chooseSplash(kind) {
    const variant = activeVariant();
    const result = await Editor.Message.request(constants_1.PACKAGE_NAME, 'select-splash-asset', {
        variantId: variant.id,
        kind,
    });
    if ((result === null || result === void 0 ? void 0 : result.canceled) || !(result === null || result === void 0 ? void 0 : result.file))
        return;
    if (kind === 'logo')
        variant.splash.logo.file = result.file;
    else
        variant.splash.background.file = result.file;
    state.splashPreviews[variant.id] = {
        ...(state.splashPreviews[variant.id] || {}),
        ...(result.previewDataUrl ? { [kind]: result.previewDataUrl } : {}),
    };
    renderSplash();
    await persist();
}
function bindEvents() {
    panel.$.version.title = 'Double-click to open project network overrides';
    panel.$.version.ondblclick = () => void run('Opening developer overrides…', () => Editor.Message.request(constants_1.PACKAGE_NAME, 'open-developer-overrides'), false);
    panel.$.copyError.onclick = () => void copyWithFeedback(panel.$.error.textContent || '', panel.$.copyError);
    panel.$.baseTask.onchange = async () => {
        const task = state.buildTasks.find((item) => item.id === panel.$.baseTask.value);
        if (task) {
            settings.buildDefaults = {
                baseTaskId: task.id,
                name: task.settings.name,
                buildPath: task.settings.buildPath,
                outputName: task.settings.outputName,
                orientation: task.settings.orientation,
                engineModulesConfigKey: task.settings.engineModulesConfigKey,
                nativeCodeBundleMode: task.settings.nativeCodeBundleMode,
            };
        }
        else {
            delete settings.buildDefaults.baseTaskId;
        }
        renderBuildConfiguration();
        await persist();
    };
    bindCommonText(panel.$.gameName, 'name');
    bindCommonText(panel.$.buildPath, 'buildPath');
    bindCommonText(panel.$.outputName, 'outputName');
    panel.$.orientation.onchange = async () => {
        const value = panel.$.orientation.value;
        settings.buildDefaults.orientation = value === 'portrait' || value === 'landscape'
            ? value : 'auto';
        await persist();
    };
    panel.$.engineConfig.onchange = async () => {
        settings.buildDefaults.engineModulesConfigKey = panel.$.engineConfig.value;
        await persist();
    };
    panel.$.nativeMode.onchange = async () => {
        const value = panel.$.nativeMode.value;
        settings.buildDefaults.nativeCodeBundleMode = value === 'wasm' || value === 'both'
            ? value : 'asmjs';
        await persist();
    };
    panel.$.variantName.onchange = async () => {
        const variant = activeVariant();
        const previous = variant.name;
        const requested = panel.$.variantName.value.trim();
        const folder = safeFolder(requested);
        const duplicate = settings.variants.some((item) => item.id !== variant.id
            && safeFolder(item.name).toLocaleLowerCase() === folder.toLocaleLowerCase());
        if (!folder || duplicate) {
            panel.$.variantName.value = previous;
            renderStatus('Invalid variation name', !folder
                ? 'Variation name must produce a non-empty folder.'
                : 'Variation output folder names must be unique, ignoring letter case.', state.outputDirectory || '');
            return;
        }
        variant.name = requested;
        renderVariants();
        renderActiveVariant();
        await persist();
    };
    panel.$.startScene.onchange = async () => {
        activeVariant().startScene = panel.$.startScene.value;
        await persist();
    };
    panel.$.splashMode.onchange = async () => {
        activeVariant().splash.mode = panel.$.splashMode.value === 'override' ? 'override' : 'inherit';
        renderSplash();
        await persist();
    };
    panel.$.logoType.onchange = async () => {
        const value = panel.$.logoType.value;
        activeVariant().splash.logo.type = value === 'none' || value === 'custom' ? value : 'default';
        renderSplash();
        await persist();
    };
    panel.$.logoScale.onchange = async () => {
        const value = Number(panel.$.logoScale.value);
        activeVariant().splash.displayRatio = Number.isFinite(value)
            ? Math.min(10, Math.max(0.01, value)) : 1;
        renderSplash();
        await persist();
    };
    panel.$.backgroundType.onchange = async () => {
        const value = panel.$.backgroundType.value;
        activeVariant().splash.background.type = value === 'color' || value === 'custom'
            ? value : 'default';
        renderSplash();
        await persist();
    };
    panel.$.backgroundColor.onchange = async () => {
        const splash = activeVariant().splash;
        splash.background.color = hexToColor(panel.$.backgroundColor.value, splash.background.color.w);
        await persist();
    };
    panel.$.selectLogo.onclick = () => void chooseSplash('logo');
    panel.$.selectBackground.onclick = () => void chooseSplash('background');
    panel.$.addVariant.onclick = addVariant;
    panel.$.duplicateVariant.onclick = () => void duplicateVariant();
    panel.$.deleteVariant.onclick = deleteVariant;
    panel.$.moveUp.onclick = () => moveVariant(-1);
    panel.$.moveDown.onclick = () => moveVariant(1);
    panel.$.snapchatFolder.onchange = async () => {
        const value = panel.$.snapchatFolder.value.trim();
        if (!value || value.length > 96 || value === '.' || value === '..'
            || !/^[A-Za-z0-9._-]+$/.test(value)) {
            panel.$.snapchatFolder.value = activeVariant().snapchat.cdnFolder;
            renderStatus('Invalid Snapchat CDN folder', 'Use 1-96 letters, numbers, dots, underscores or hyphens; "." and ".." are not allowed.', state.outputDirectory || '');
            return;
        }
        activeVariant().snapchat.cdnFolder = value;
        await persist();
    };
    panel.$.snapchatConfig.onchange = async () => {
        activeVariant().snapchat.configJson = panel.$.snapchatConfig.value;
        await persist();
    };
    for (const radio of Array.from(rootElement().querySelectorAll('input[name="encoding"]'))) {
        radio.onchange = async () => {
            if (!radio.checked)
                return;
            settings.assetEncoding = radio.value === 'base122' ? 'base122' : 'base64';
            await persist();
        };
    }
    panel.$.obfuscate.onchange = async () => {
        settings.obfuscate = panel.$.obfuscate.checked;
        await persist();
    };
    panel.$.autoPack.onchange = async () => {
        settings.autoPackCocosBuilds = panel.$.autoPack.checked;
        await persist();
    };
    panel.$.targetSubfolders.onchange = async () => {
        settings.createTargetSubfolders = panel.$.targetSubfolders.checked;
        await persist();
    };
    panel.$.installAdsManager.onclick = () => void run('Installing AdsManager...', async () => {
        const result = await Editor.Message.request(constants_1.PACKAGE_NAME, 'install-ads-manager');
        state.adsManager = { path: result.path, installed: Boolean(result.installed) };
        renderAdsManager();
        return result;
    }, false);
    panel.$.selectAll.onclick = async () => {
        for (const id of types_1.NETWORK_IDS)
            settings.networks[id] = true;
        renderNetworks();
        renderSnapchat();
        await persist();
    };
    panel.$.clearAll.onclick = async () => {
        for (const id of types_1.NETWORK_IDS)
            settings.networks[id] = false;
        renderNetworks();
        renderSnapchat();
        await persist();
    };
    panel.$.buildSelected.onclick = () => void runBuild(settings.variants.filter((variant) => variant.selected).map((variant) => variant.id));
    panel.$.buildCurrent.onclick = () => void runBuild([activeVariant().id]);
    panel.$.estimateSize.onclick = () => void runEstimate();
    panel.$.packExisting.onclick = () => void run('Packing existing build…', () => Editor.Message.request(constants_1.PACKAGE_NAME, 'pack-existing', {
        settings,
        variantId: activeVariant().id,
    }));
    panel.$.preview.onclick = () => void run('Opening preview…', () => Editor.Message.request(constants_1.PACKAGE_NAME, 'preview', {
        variantId: activeVariant().id,
    }));
    panel.$.openOutput.onclick = () => void run('Opening output…', () => Editor.Message.request(constants_1.PACKAGE_NAME, 'open-output'), false);
    panel.$.openBuildSettings.onclick = () => void run('Opening Build Settings…', () => Editor.Message.request('builder', 'open'), false);
}
function estimatePhaseLabel(stateValue) {
    const labels = {
        building: 'Building web-mobile...',
        analyzing: 'Analyzing resources...',
        calculating: 'Calculating Base64/Base122...',
        publishing: 'Publishing diagnostic build...',
        cleanup: 'Cleaning temporary Builder task...',
    };
    return labels[stateValue.phase || ''] || 'Estimating Default size...';
}
async function runEstimate() {
    const variantId = activeVariant().id;
    await run('Building web-mobile for size estimate...', async () => {
        let polling = true;
        const poll = async () => {
            while (polling) {
                await new Promise((resolve) => setTimeout(resolve, 300));
                if (!polling)
                    break;
                try {
                    const latest = await Editor.Message.request(constants_1.PACKAGE_NAME, 'get-state');
                    state.estimateState = latest.estimateState;
                    renderStatus(estimatePhaseLabel(latest.estimateState), '', state.outputDirectory || '');
                }
                catch (error) { }
            }
        };
        const pollingPromise = poll();
        try {
            const result = await Editor.Message.request(constants_1.PACKAGE_NAME, 'estimate-size', {
                settings,
                variantId,
            });
            const variant = settings.variants.find((item) => item.id === variantId);
            if (variant && (result === null || result === void 0 ? void 0 : result.estimate))
                variant.sizeEstimate = result.estimate;
            const latest = await Editor.Message.request(constants_1.PACKAGE_NAME, 'get-state');
            state.estimateState = latest.estimateState;
            state.estimateStale = latest.estimateStale;
            if (latest.settings)
                settings = latest.settings;
            captureEstimateSignatures(false);
            renderEstimate();
            return {
                ...result,
                warning: latest.estimateState.warning,
            };
        }
        finally {
            polling = false;
            await pollingPromise;
        }
    });
}
async function runBuild(variantIds) {
    await run('Starting build queue…', async () => {
        let polling = true;
        const poll = async () => {
            while (polling) {
                await new Promise((resolve) => setTimeout(resolve, 300));
                if (!polling)
                    break;
                try {
                    const latest = await Editor.Message.request(constants_1.PACKAGE_NAME, 'get-state');
                    renderQueue(latest.queue);
                    renderVariants();
                }
                catch (error) { }
            }
        };
        const pollingPromise = poll();
        try {
            const result = await Editor.Message.request(constants_1.PACKAGE_NAME, 'build', {
                settings,
                variantIds,
            });
            if (result === null || result === void 0 ? void 0 : result.queue)
                renderQueue(result.queue);
            return result;
        }
        finally {
            polling = false;
            await pollingPromise;
        }
    });
}
async function run(label, operation, persistFirst = true) {
    if (busy)
        return;
    setBusy(true);
    renderStatus(label, '', state.outputDirectory || '');
    try {
        if (persistFirst)
            await persist();
        const result = await operation();
        if (result === null || result === void 0 ? void 0 : result.canceled) {
            renderStatus('Canceled', '', state.outputDirectory || '');
        }
        else if (result === null || result === void 0 ? void 0 : result.queue) {
            const failures = result.queue.items.filter((item) => item.status === 'failure');
            renderStatus(panel.$.progress.textContent, failures.map((item) => `${item.name}\n${item.error || 'Build failed'}`).join('\n\n'), result.outputDirectory || state.outputDirectory || '');
        }
        else {
            renderStatus((result === null || result === void 0 ? void 0 : result.warning) ? 'Done with warning' : 'Done', (result === null || result === void 0 ? void 0 : result.warning) || '', (result === null || result === void 0 ? void 0 : result.outputDirectory) || state.outputDirectory || '');
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.stack || error.message : String(error);
        renderStatus('Failed', message, state.outputDirectory || '');
    }
    finally {
        try {
            const refreshed = await Editor.Message.request(constants_1.PACKAGE_NAME, 'get-state');
            if ((refreshed === null || refreshed === void 0 ? void 0 : refreshed.version) === builder_tasks_1.EXTENSION_VERSION) {
                state.previewAvailable = refreshed.previewAvailable;
                state.outputDirectory = refreshed.outputDirectory;
            }
        }
        catch (error) {
            console.warn('[CGB Studio packer] Could not refresh panel state.', error);
        }
        setBusy(false);
    }
}
function removeUnavailableScenes() {
    var _a;
    const available = new Map(state.projectScenes.map((scene) => [scene.uuid, scene]));
    for (const variant of settings.variants) {
        variant.scenes = variant.scenes
            .filter((scene) => available.has(scene.uuid))
            .map((scene) => available.get(scene.uuid));
        if (!variant.scenes.some((scene) => scene.uuid === variant.startScene)) {
            variant.startScene = ((_a = variant.scenes[0]) === null || _a === void 0 ? void 0 : _a.uuid) || '';
        }
    }
}
async function ready() {
    panel = this;
    persistQueue = Promise.resolve();
    panel.$.openBuildSettings.onclick = () => void run('Opening Build Settings…', () => Editor.Message.request('builder', 'open'), false);
    try {
        const received = await Editor.Message.request(constants_1.PACKAGE_NAME, 'get-state');
        if ((received === null || received === void 0 ? void 0 : received.version) !== builder_tasks_1.EXTENSION_VERSION) {
            incompatible = true;
            const backendVersion = (received === null || received === void 0 ? void 0 : received.version) || 'older/unknown';
            renderStatus('Creator restart required', `Panel v${builder_tasks_1.EXTENSION_VERSION} is paired with backend v${backendVersion}. Close all Cocos Creator processes and reopen the project.`, (received === null || received === void 0 ? void 0 : received.outputDirectory) || '');
            setBusy(false);
            return;
        }
        state = received;
        settings = state.settings;
        captureEstimateSignatures(false);
        removeUnavailableScenes();
        bindEvents();
        renderAll();
        renderStatus(state.busy ? 'Working…' : 'Ready', state.lastError || '', state.outputDirectory || '');
        renderQueue(state.queue);
    }
    catch (error) {
        const message = error instanceof Error ? error.stack || error.message : String(error);
        console.error('[CGB Studio packer] Panel initialization failed.', error);
        renderStatus('Panel initialization failed', message);
    }
}
exports.ready = ready;
function close() { }
exports.close = close;
