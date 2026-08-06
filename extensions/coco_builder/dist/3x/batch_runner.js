"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPlayableBatch = exports.getUniqueChannelNames = exports.loadBatchConfigFile = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = __importDefault(require("../core/config/config"));
const build_1 = __importDefault(require("../core/build"));
const cache_1 = __importDefault(require("../platform/cocos/cache"));
/** Снимок каналов при первой загрузке модуля (как в оригинальном super-html). */
const CHANNEL_ADAPTER_TEMPLATE = JSON.stringify(config_1.default.inject_channel_adapter);
function freshChannelAdapter() {
    return JSON.parse(CHANNEL_ADAPTER_TEMPLATE);
}
function getAllUniqueChannelNames() {
    const seen = new Set();
    const out = [];
    for (const ch of config_1.default.inject_channel_adapter) {
        const n = ch && ch.s_name ? String(ch.s_name) : "";
        if (!n || seen.has(n)) {
            continue;
        }
        seen.add(n);
        out.push(n);
    }
    return out;
}
function buildPlatformDebugInject(channelName) {
    const ch = String(channelName || "");
    return "(function(){try{" +
        "var CH=" + JSON.stringify(ch) + ";" +
        "var G=window;" +
        "if(!G.__superPlayableDebug){" +
        "G.__superPlayableDebug={lines:[],init:false};" +
        "}" +
        "var D=G.__superPlayableDebug;" +
        "if(!D.log){" +
        "D.log=function(type,msg){" +
        "try{" +
        "var color=type==='ok'?'#2fb45d':'#d85b5b';" +
        "console.log('%c[playable debug] '+msg,'color:'+color+';font-weight:700');" +
        "if(!D.panel||!D.panel.parentNode){return;}" +
        "var row=document.createElement('div');" +
        "row.style.color=color;" +
        "row.style.margin='2px 0';" +
        "row.textContent='['+type.toUpperCase()+'] '+msg;" +
        "D.panel.appendChild(row);" +
        "if(D.panel.childNodes.length>18){D.panel.removeChild(D.panel.firstChild);}" +
        "}catch(_e){}" +
        "};" +
        "}" +
        "if(!D.init&&typeof document!=='undefined'){" +
        "D.init=true;" +
        "var box=document.createElement('div');" +
        "box.id='__super_playable_debug_box';" +
        "box.style.cssText='position:fixed;right:8px;bottom:8px;z-index:2147483646;background:rgba(0,0,0,.72);border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:8px;max-width:360px;max-height:40vh;overflow:auto;font:12px/1.4 monospace;color:#fff;';" +
        "var t=document.createElement('div');t.textContent='Playable Debug SDK';t.style.cssText='font-weight:700;margin-bottom:4px;';box.appendChild(t);" +
        "var body=document.createElement('div');body.id='__super_playable_debug_lines';box.appendChild(body);" +
        "document.body&&document.body.appendChild(box);" +
        "D.panel=body;" +
        "}" +
        "var ok=function(m){D.log&&D.log('ok',CH+': '+m);};" +
        "var bad=function(m){D.log&&D.log('err',CH+': '+m);};" +
        "if(CH==='tiktok'||CH==='pangle'){" +
        "if(typeof G.openAppStore!=='function'){G.openAppStore=function(){ok('openAppStore()');return true;};}" +
        "ok('openAppStore mock ready');" +
        "}" +
        "if(CH==='facebook'||CH==='moloco'){" +
        "if(!G.FbPlayableAd){G.FbPlayableAd={onCTAClick:function(){ok('FbPlayableAd.onCTAClick()');}};}" +
        "ok('FbPlayableAd mock ready');" +
        "}" +
        "if(CH==='bigo'){" +
        "if(!G.BGY_MRAID){G.BGY_MRAID={open:function(){ok('BGY_MRAID.open()');},gameReady:function(){ok('BGY_MRAID.gameReady()');},gameEnd:function(){ok('BGY_MRAID.gameEnd()');}};}" +
        "ok('BGY_MRAID mock ready');" +
        "}" +
        "if(CH==='kwai'){" +
        "if(!G.ks_playable_openAppStore){G.ks_playable_openAppStore=function(){ok('ks_playable_openAppStore()');};}" +
        "if(!G.ks_playable_startPlay){G.ks_playable_startPlay=function(){ok('ks_playable_startPlay()');};}" +
        "if(!G.ks_playable_exposurePage){G.ks_playable_exposurePage=function(){ok('ks_playable_exposurePage()');};}" +
        "ok('Kwai mock ready');" +
        "}" +
        "if(CH==='mintegral'){" +
        "if(!G.install){G.install=function(){ok('install()');};}" +
        "if(!G.gameReady){G.gameReady=function(){ok('gameReady()');try{if(typeof G.super_boot_engine==='function'){G.super_boot_engine();ok('super_boot_engine() from gameReady');}}catch(_e){bad('super_boot_engine() failed');}};}" +
        "if(!G.gameEnd){G.gameEnd=function(){ok('gameEnd()');};}" +
        "ok('Mintegral mock ready');" +
        "}" +
        "if(CH==='vungle'){" +
        "ok('Vungle uses postMessage bridge');" +
        "}" +
        "if(CH==='ironsource'){" +
        "if(!G.dapi||typeof G.dapi!=='object'){" +
        "var listeners={};" +
        "G.dapi={isDemoDapi:true,isReady:function(){return true;},isViewable:function(){return true;},getAudioVolume:function(){return 1;},getScreenSize:function(){return{width:window.innerWidth||320,height:window.innerHeight||480};},addEventListener:function(n,cb){(listeners[n]=listeners[n]||[]).push(cb);},removeEventListener:function(n,cb){if(!listeners[n])return;listeners[n]=listeners[n].filter(function(x){return x!==cb;});},openStoreUrl:function(){ok('dapi.openStoreUrl()');}};" +
        "setTimeout(function(){(listeners.ready||[]).forEach(function(cb){try{cb();}catch(_e){}});(listeners.viewableChange||[]).forEach(function(cb){try{cb({isViewable:true});}catch(_e){}});},20);" +
        "}" +
        "ok('dapi mock ready');" +
        "}" +
        "if(CH==='applovin'||CH==='ironsourcemraid'||CH==='unity'||CH==='liftoff'){" +
        "if(!G.mraid||typeof G.mraid!=='object'){" +
        "var L={};" +
        "G.mraid={_listeners:L,_state:'default',getState:function(){return this._state||'default';},isViewable:function(){return true;},addEventListener:function(n,cb){(L[n]=L[n]||[]).push(cb);if(n==='ready'){setTimeout(function(){try{cb();}catch(_e){}},10);}},removeEventListener:function(n,cb){if(!L[n])return;L[n]=L[n].filter(function(x){return x!==cb;});},open:function(url){ok('mraid.open('+(url||'')+')');},fire:function(n){var args=[].slice.call(arguments,1);(L[n]||[]).forEach(function(cb){try{cb.apply(null,args);}catch(_e){}});}};" +
        "setTimeout(function(){(L.viewableChange||[]).forEach(function(cb){try{cb(true);}catch(_e){}});},30);" +
        "}else if(typeof G.mraid.fire!=='function'){" +
        "G.mraid.fire=function(n){var args=[].slice.call(arguments,1);var ls=(this._listeners&&this._listeners[n])||[];ls.forEach(function(cb){try{cb.apply(null,args);}catch(_e){}});};" +
        "}" +
        "ok('mraid mock ready');" +
        "}" +
        "if(CH==='ironsourcemraid'){" +
        "if(typeof window!=='undefined'&&window.addEventListener){" +
        "window.addEventListener('load',function(){setTimeout(function(){try{" +
        "ok('DIAGNOSTIC start');" +
        "if(typeof G.cc==='undefined'){bad('cc not found');return;}" +
        "var node=G.cc.find&&G.cc.find('SoundManager');" +
        "var comp=node&&node.getComponent&&node.getComponent('SoundManager');" +
        "if(!comp&&G.cc.director&&G.cc.director.getScene){var sc=G.cc.director.getScene();if(sc&&sc.getComponentsInChildren){var lst=sc.getComponentsInChildren('SoundManager')||[];if(lst.length){comp=lst[0];node=comp.node||node;}}}" +
        "if(!comp&&G.cc.director&&G.cc.director.getScene&&G.cc.Component){var sc2=G.cc.director.getScene();if(sc2&&sc2.getComponentsInChildren){var lst2=sc2.getComponentsInChildren(G.cc.Component)||[];for(var i=0;i<lst2.length;i++){var c0=lst2[i];try{var n0=(c0&&c0.constructor&&c0.constructor.name)||'';if(n0==='SoundManager'){comp=c0;node=c0.node||node;break;}}catch(_e){}}}}" +
        "if(!comp){bad('SoundManager component not found on scene');return;}" +
        "if(node){ok('SoundManager node found');}" +
        "ok('SoundManager component found');" +
        "G.__superIronComp=comp;" +
        "if(typeof comp.mute==='function'){ok('mute() found');}else{bad('mute() missing');}" +
        "var hasListener=((G.mraid&&G.mraid._listeners&&G.mraid._listeners['audioVolumeChange'])?G.mraid._listeners['audioVolumeChange'].length:0)>0;" +
        "if(hasListener){ok('audioVolumeChange listener found');}else{bad('audioVolumeChange listener missing');}" +
        "if(typeof document!=='undefined'&&!document.getElementById('__super_iron_btn')){" +
        "var isMuted=true;" +
        "var btn=document.createElement('div');" +
        "btn.id='__super_iron_btn';" +
        "btn.innerHTML='🔇';" +
        "btn.style.cssText='position:fixed;top:20px;left:20px;z-index:2147483646;width:50px;height:50px;border-radius:50%;background:rgba(0,0,0,0.8);border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer;user-select:none;box-shadow:0 2px 10px rgba(0,0,0,0.5);transition:transform 0.1s;';" +
        "var label=document.createElement('div');" +
        "label.id='__super_iron_lbl';" +
        "label.textContent='ironSource';" +
        "label.style.cssText='position:fixed;top:75px;left:8px;z-index:2147483646;color:#fff;font-size:9px;font-family:sans-serif;background:rgba(0,0,0,0.6);padding:1px 5px;border-radius:3px;';" +
        "btn.addEventListener('pointerdown',function(){btn.style.transform='scale(0.9)';});" +
        "btn.addEventListener('pointerup',function(){btn.style.transform='scale(1)';});" +
        "btn.addEventListener('click',function(e){try{e.stopPropagation();isMuted=!isMuted;btn.innerHTML=isMuted?'🔇':'🔊';if(G.mraid&&typeof G.mraid.fire==='function'){G.mraid.fire('audioVolumeChange',isMuted?0:100);}ok(isMuted?'Muted':'Unmuted');var c=G.__superIronComp||comp;if(!c&&G.cc&&G.cc.find){var n=G.cc.find('SoundManager');c=n&&n.getComponent&&n.getComponent('SoundManager');}if(c&&typeof c.offbutton==='function'){c.offbutton();ok('offbutton() called (optional)');}}catch(err){bad('button click error: '+(err&&err.message||err));}});" +
        "document.body&&document.body.appendChild(btn);" +
        "document.body&&document.body.appendChild(label);" +
        "ok('ironSource fake player button ready');" +
        "}" +
        "}catch(e){bad('diagnostic error: '+(e&&e.message||e));}},3000);});" +
        "}" +
        "}" +
        "}catch(e){try{console.error('[playable debug inject]',e);}catch(_e){}}})();";
}
/** Доп. <head>-скрипт только для applovin: AXON LOADING (остальные события — в коде игры). */
function buildPlayableChannelHeadInject(opts, allow) {
    const map = {};
    const ch = (opts && opts.channelOptions) || {};
    const applovinOn = !allow || allow.has("applovin");
    const a = ch.applovin;
    let wantLoading = false;
    if (a && typeof a.axonLoading === "boolean") {
        wantLoading = a.axonLoading;
    }
    else if (a && a.axonEnabled) {
        wantLoading = a.axonLoading !== false;
    }
    if (applovinOn && wantLoading) {
        map.applovin = "if(typeof window.ALPlayableAnalytics!=='undefined'){window.ALPlayableAnalytics.trackEvent(" +
            JSON.stringify("LOADING") + ");}";
    }
    const debugPlatforms = !!(ch && ch.debugAllPlatforms);
    if (debugPlatforms) {
        const channels = allow ? Array.from(allow) : getAllUniqueChannelNames();
        for (const channelName of channels) {
            const dbg = buildPlatformDebugInject(channelName);
            if (!dbg) {
                continue;
            }
            if (map[channelName]) {
                map[channelName] += "\n" + dbg;
            }
            else {
                map[channelName] = dbg;
            }
        }
    }
    return map;
}
/** Скрипт в <head>: window.__PLAYABLE_ITERATION__ = { targets: [...] } для PlayableBatchOverrideApplier. */
function buildPlayableIterationScript(it) {
    const targets = [];
    if (it && it.targets && Array.isArray(it.targets)) {
        for (const t of it.targets) {
            if (t && t.component && t.properties && typeof t.properties === "object") {
                targets.push({
                    nodePath: (t.nodePath != null) ? String(t.nodePath) : "",
                    component: String(t.component),
                    properties: t.properties,
                });
            }
        }
    }
    else if (it && it.target && it.target.component && it.target.properties &&
        typeof it.target.properties === "object") {
        targets.push({
            nodePath: (it.target.nodePath != null) ? String(it.target.nodePath) : "",
            component: String(it.target.component),
            properties: it.target.properties,
        });
    }
    else {
        const overrides = (it && it.overrides && typeof it.overrides === "object") ? it.overrides : {};
        if (Object.keys(overrides).length === 0) {
            return "";
        }
        const comp = (it && it.component) ? String(it.component) : "GameSessionController";
        const nodePath = (it && it.nodePath != null) ? String(it.nodePath) : "";
        targets.push({
            nodePath,
            component: comp,
            properties: overrides,
        });
    }
    if (targets.length === 0) {
        return "";
    }
    return "window.__PLAYABLE_ITERATION__=" + JSON.stringify({ targets }) + ";";
}
function loadBatchConfigFile(absPath) {
    const raw = fs_1.default.readFileSync(absPath, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") {
        throw new Error("Invalid batch JSON");
    }
    return data;
}
exports.loadBatchConfigFile = loadBatchConfigFile;
function getUniqueChannelNames() {
    const seen = new Set();
    const list = [];
    for (const ch of config_1.default.inject_channel_adapter) {
        if (!seen.has(ch.s_name)) {
            seen.add(ch.s_name);
            list.push(ch.s_name);
        }
    }
    return list.sort();
}
exports.getUniqueChannelNames = getUniqueChannelNames;
/**
 * @param opts.webRoot — папка web-mobile (где index.html)
 * @param opts.enabledChannelNames — какие s_name включить; пусто = все как в шаблоне
 * @param opts.iterations — [{ folder, overrides }]
 * @param opts.batchBuildName — метка билда (например ICE_PLA1); папка вывода = {slug}_BUILD рядом с web-mobile
 * @param opts.batchNamesLowercase — если true (по умолчанию), slug и имена площадок в нижнем регистре
 * @param opts.baseOut — полный путь корня вывода (редко); иначе webRoot/../{slug}_BUILD
 * @param opts.enableObfuscator — undefined: из cache super-html
 */
/** Сегмент имени билда / папки: без разделителей и "..". */
function sanitizeBatchBuildSlug(raw) {
    let s = String(raw != null ? raw : "").trim().replace(/\\/g, "/");
    const parts = s.split("/").filter((p) => p && p !== "." && p !== "..");
    const base = parts.length ? parts[parts.length - 1] : "";
    const safe = base.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "");
    return safe || "playable";
}
/** Очистить содержимое каталога (сам каталог оставить). */
function emptyDirectoryContents(absDir) {
    if (!absDir || !fs_1.default.existsSync(absDir)) {
        return;
    }
    let names;
    try {
        names = fs_1.default.readdirSync(absDir);
    }
    catch (_e) {
        return;
    }
    for (const name of names) {
        const p = path_1.default.join(absDir, name);
        try {
            fs_1.default.rmSync(p, { recursive: true, force: true });
        }
        catch (_r) { }
    }
}
/** true, если вывод — подкаталог того же родителя, что и webRoot (не сам родитель). */
function isOutputDirBesideWebRoot(baseOut, webRoot) {
    const parentDir = path_1.default.normalize(path_1.default.dirname(webRoot));
    const out = path_1.default.normalize(baseOut);
    if (out === parentDir) {
        return false;
    }
    const rel = path_1.default.relative(parentDir, out);
    return rel !== "" && !rel.startsWith("..") && !path_1.default.isAbsolute(rel);
}
function normalizeWebRoot(webRoot, projectPath) {
    if (!webRoot || typeof webRoot !== "string") {
        return "";
    }
    let t = webRoot.trim().replace(/^["']|["']$/g, "");
    if (!t) {
        return "";
    }
    if (path_1.default.isAbsolute(t)) {
        return path_1.default.normalize(t);
    }
    if (projectPath) {
        return path_1.default.normalize(path_1.default.join(projectPath, t));
    }
    return path_1.default.normalize(path_1.default.resolve(t));
}
async function runPlayableBatch(opts) {
    var _a, _c;
    const projectPath = (opts === null || opts === void 0 ? void 0 : opts.projectPath) || "";
    let webRoot = normalizeWebRoot((opts === null || opts === void 0 ? void 0 : opts.webRoot) || "", projectPath);
    if (!webRoot) {
        webRoot = normalizeWebRoot(((_a = cache_1.default.get()) === null || _a === void 0 ? void 0 : _a.path) || "", projectPath);
    }
    const rawWeb = (opts === null || opts === void 0 ? void 0 : opts.webRoot);
    const indexHtml = webRoot ? path_1.default.join(webRoot, "index.html") : "";
    const indexExists = webRoot && fs_1.default.existsSync(indexHtml);
    const useEn = (opts === null || opts === void 0 ? void 0 : opts.panelLang) === "en";
    if (!webRoot || !indexExists) {
        if (useEn) {
            throw new Error("Web Mobile folder not found or index.html is missing.\n" +
                "Expected file: " + (indexHtml || "(folder not set)") + "\n" +
                "After normalization: " + (webRoot || "(empty)") + "\n" +
                "Panel webRoot field: " + JSON.stringify(rawWeb) + "\n" +
                "projectPath: " + (projectPath || "(empty)") + "\n" +
                "Use a path relative to the project (build/web-mobile), a full path, or Browse folder….");
        }
        throw new Error("Папка Web Mobile не найдена или нет index.html.\n" +
            "Ожидался файл: " + (indexHtml || "(папка не задана)") + "\n" +
            "После нормализации папка: " + (webRoot || "(пусто)") + "\n" +
            "Как в панели (webRoot): " + JSON.stringify(rawWeb) + "\n" +
            "projectPath: " + (projectPath || "(пусто)") + "\n" +
            "Укажите путь от корня проекта (build/web-mobile) или полный путь, кнопка «Обзор папки…».");
    }
    let version = (opts === null || opts === void 0 ? void 0 : opts.engineVersion);
    if (!version) {
        try {
            //@ts-ignore
            version = Editor.App.version;
        }
        catch (_d) {
            version = "3.8.0";
        }
    }
    if (!version || typeof version !== "string") {
        version = "3.8.0";
    }
    const parentDir = path_1.default.dirname(webRoot);
    const lowerNames = (opts === null || opts === void 0 ? void 0 : opts.batchNamesLowercase) !== false;
    let slug = sanitizeBatchBuildSlug((opts === null || opts === void 0 ? void 0 : opts.batchBuildName) ||
        (opts === null || opts === void 0 ? void 0 : opts.batchOutputDir));
    if (lowerNames) {
        slug = slug.toLowerCase();
    }
    config_1.default.s_playable_batch_build_slug = slug;
    config_1.default.s_playable_batch_force_lower = lowerNames;
    let baseOut;
    const rawBase = opts === null || opts === void 0 ? void 0 : opts.baseOut;
    if (rawBase && String(rawBase).trim()) {
        const t = String(rawBase).trim();
        baseOut = path_1.default.isAbsolute(t)
            ? path_1.default.normalize(t)
            : path_1.default.normalize(path_1.default.join(projectPath || parentDir, t));
    }
    else {
        const rootDir = slug + "_BUILD";
        baseOut = path_1.default.normalize(path_1.default.join(parentDir, rootDir));
    }
    if (isOutputDirBesideWebRoot(baseOut, webRoot)) {
        emptyDirectoryContents(baseOut);
    }
    const iterations = ((_c = opts === null || opts === void 0 ? void 0 : opts.iterations) !== null && _c !== void 0 ? _c : [{ folder: "default", overrides: {} }]);
    const enabled = opts === null || opts === void 0 ? void 0 : opts.enabledChannelNames;
    const useFilter = Array.isArray(enabled) && enabled.length > 0;
    const allow = useFilter ? new Set(enabled) : null;
    const obfusc = (opts === null || opts === void 0 ? void 0 : opts.enableObfuscator) !== undefined
        ? opts.enableObfuscator
        : cache_1.default.get().enable_obfuscator;
    config_1.default.is_obfuscator = !!obfusc;
    const results = [];
    try {
        for (const it of iterations) {
            const folder = (it && it.folder) ? String(it.folder).replace(/[\\/]/g, "_") : "default";
            const outDir = path_1.default.join(baseOut, folder);
            config_1.default.s_playable_batch_channel_prefix = folder;
            config_1.default.inject_channel_adapter = freshChannelAdapter();
            if (allow) {
                for (const ch of config_1.default.inject_channel_adapter) {
                    ch.b_enable = allow.has(ch.s_name);
                }
            }
            const injectBody = buildPlayableIterationScript(it);
            config_1.default.s_playable_batch_inject = injectBody || "";
            config_1.default.playable_batch_channel_head_inject = buildPlayableChannelHeadInject(opts, allow);
            await new Promise((resolve, reject) => {
                try {
                    new build_1.default(version, webRoot, outDir, (err) => {
                        if (err) {
                            reject(err);
                        }
                        else {
                            resolve();
                        }
                    });
                }
                catch (e) {
                    reject(e);
                }
            });
            results.push({ folder, outDir });
        }
    }
    finally {
        config_1.default.s_playable_batch_channel_prefix = "";
        config_1.default.s_playable_batch_build_slug = "";
        config_1.default.s_playable_batch_force_lower = false;
    }
    config_1.default.s_playable_batch_inject = "";
    config_1.default.playable_batch_channel_head_inject = {};
    config_1.default.inject_channel_adapter = freshChannelAdapter();
    return { ok: true, results, baseOut };
}
exports.runPlayableBatch = runPlayableBatch;
