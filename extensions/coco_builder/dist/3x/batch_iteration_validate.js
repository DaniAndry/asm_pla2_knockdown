"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePlayableBatchIterations = validatePlayableBatchIterations;
const fs = require("fs");
const path = require("path");
const RESERVED = new Set([
    "if", "for", "while", "switch", "case", "break", "continue", "return",
    "function", "class", "export", "import", "const", "let", "var", "new", "this",
    "else", "try", "catch", "throw", "await", "async", "type", "interface", "enum",
    "extends", "implements", "null", "true", "false", "undefined", "void", "get", "set",
    "public", "private", "protected", "readonly", "static", "override", "abstract", "declare",
]);
function walkFiles(root, exts, out = []) {
    if (!root || !fs.existsSync(root)) {
        return out;
    }
    let dirents;
    try {
        dirents = fs.readdirSync(root, { withFileTypes: true });
    }
    catch (_e) {
        return out;
    }
    for (const d of dirents) {
        const p = path.join(root, d.name);
        if (d.isDirectory()) {
            if (d.name === "node_modules" || d.name === ".git") {
                continue;
            }
            walkFiles(p, exts, out);
        }
        else if (d.isFile()) {
            const low = d.name.toLowerCase();
            if (exts.some((e) => low.endsWith(e))) {
                out.push(p);
            }
        }
    }
    return out;
}
/** @returns {{ exactMap: Map<string, string>, lowerMap: Map<string, string> }} */
function buildComponentNameIndex(projectPath) {
    const exactMap = new Map();
    const lowerMap = new Map();
    const addName = (name, file) => {
        const n = String(name || "").trim();
        if (!n) {
            return;
        }
        if (!exactMap.has(n)) {
            exactMap.set(n, file);
        }
        const low = n.toLowerCase();
        if (!lowerMap.has(low)) {
            lowerMap.set(low, file);
        }
    };
    const assets = path.join(projectPath, "assets");
    for (const ext of [".ts", ".js"]) {
        for (const file of walkFiles(assets, [ext])) {
            if (file.endsWith(".d.ts")) {
                continue;
            }
            let text;
            try {
                text = fs.readFileSync(file, "utf8");
            }
            catch (_e) {
                continue;
            }
            const ccclassRe = /@ccclass\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
            let m;
            while ((m = ccclassRe.exec(text)) !== null) {
                addName(m[1], file);
            }
            const classRe = /\bclass\s+([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
            while ((m = classRe.exec(text)) !== null) {
                addName(m[1], file);
            }
            const stem = path.basename(file).replace(/\.(ts|js)$/i, "");
            addName(stem, file);
        }
    }
    return { exactMap, lowerMap };
}
function componentNameCandidates(name) {
    const raw = String(name || "").trim();
    const out = [];
    const push = (v) => {
        const n = String(v || "").trim();
        if (!n || out.includes(n)) {
            return;
        }
        out.push(n);
    };
    push(raw);
    const noScriptSuffix = raw.replace(/\s*\(\s*script\s*\)\s*$/i, "").trim();
    push(noScriptSuffix);
    const noExt = noScriptSuffix.replace(/\.(ts|js)$/i, "").trim();
    push(noExt);
    const pathNormalized = noExt.replace(/\\/g, "/");
    const pathPart = pathNormalized.split("/").filter(Boolean).pop() || "";
    push(pathPart);
    const dottedPart = noExt.split(".").filter(Boolean).pop() || "";
    push(dottedPart);
    return out;
}
function resolveComponentFilePath(compName, nameIndex) {
    if (!compName || !nameIndex) {
        return "";
    }
    const cands = componentNameCandidates(compName);
    for (const cand of cands) {
        const byExact = nameIndex.exactMap.get(cand);
        if (byExact) {
            return byExact;
        }
    }
    for (const cand of cands) {
        const byLow = nameIndex.lowerMap.get(cand.toLowerCase());
        if (byLow) {
            return byLow;
        }
    }
    return "";
}
/** Поля класса (TS/JS) — эвристика под реальные сигнатуры Cocos-компонентов. */
function extractAssignableFieldNames(sourceText) {
    const set = new Set();
    const lines = String(sourceText || "").split(/\r?\n/);
    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith("//") || line.startsWith("*") || line.startsWith("@")) {
            continue;
        }
        // Пример: public foo?: number = 1;  /  foo!: Node;  /  protected bar: string;
        const m = /^(?:(?:public|private|protected|readonly|static|override|abstract|declare)\s+)*([a-zA-Z_][a-zA-Z0-9_]*)\s*[!?]?\s*(?::[^;=]+)?\s*(?:=[^;]+)?\s*;?$/.exec(line);
        if (!m) {
            continue;
        }
        const name = m[1];
        if (name.startsWith("_")) {
            continue;
        }
        if (RESERVED.has(name)) {
            continue;
        }
        set.add(name);
    }
    return set;
}
const META_KEYS = new Set([
    "__type__", "_name", "_objFlags", "__editorExtras__", "node", "_enabled",
    "__prefab", "_id", "_editorExtras", "_editorOnly",
]);
function collectCustomComponentKeySetsFromSceneJson(arr) {
    /** @type {Set<string>[]} */
    const out = [];
    if (!Array.isArray(arr)) {
        return out;
    }
    for (const obj of arr) {
        if (!obj || typeof obj !== "object") {
            continue;
        }
        if (typeof obj.__type__ !== "string") {
            continue;
        }
        if (obj.__type__.startsWith("cc.")) {
            continue;
        }
        if (obj.node === undefined) {
            continue;
        }
        if (obj._enabled === undefined) {
            continue;
        }
        const keys = new Set();
        for (const k of Object.keys(obj)) {
            if (META_KEYS.has(k)) {
                continue;
            }
            keys.add(k);
        }
        out.push(keys);
    }
    return out;
}
function loadAllSceneComponentKeySets(projectPath) {
    /** @type {Set<string>[]} */
    const all = [];
    const assets = path.join(projectPath, "assets");
    const scenes = walkFiles(assets, [".scene"]);
    for (const sp of scenes) {
        let raw;
        try {
            raw = fs.readFileSync(sp, "utf8");
        }
        catch (_e) {
            continue;
        }
        let arr;
        try {
            arr = JSON.parse(raw);
        }
        catch (_e2) {
            continue;
        }
        const part = collectCustomComponentKeySetsFromSceneJson(arr);
        for (const s of part) {
            all.push(s);
        }
    }
    return all;
}
function sceneKeySetMatchesClassFields(classFields, ks) {
    if (classFields.size === 0) {
        return false;
    }
    const need = Math.min(4, Math.max(1, Math.ceil(classFields.size * 0.15)));
    let n = 0;
    for (const f of classFields) {
        if (ks.has(f)) {
            n++;
        }
    }
    return n >= need;
}
/** Первый набор ключей компонента на сцене, похожий на этот класс (по пересечению с полями из TS). */
function pickSceneKeySetForClass(classFields, sceneCompKeySets) {
    if (classFields.size === 0) {
        return null;
    }
    for (const ks of sceneCompKeySets) {
        if (sceneKeySetMatchesClassFields(classFields, ks)) {
            return ks;
        }
    }
    return null;
}
/** Нет полей в batch — проверяем, что на сцене есть компонент с несколькими полями этого класса. */
function sceneHasLikelyComponent(classFields, sceneCompKeySets) {
    return pickSceneKeySetForClass(classFields, sceneCompKeySets) != null;
}
/**
 * @param {string} projectPath
 * @param {Array<{ folder?: string, target?: { nodePath?: string, component?: string, properties?: Record<string, unknown> } }>} iterations
 */
function validatePlayableBatchIterations(projectPath, iterations) {
    const nameIndex = buildComponentNameIndex(projectPath);
    const sceneSets = loadAllSceneComponentKeySets(projectPath);
    const items = [];
    const arr = Array.isArray(iterations) ? iterations : [];
    for (const it of arr) {
        const target = (it && it.target) || {};
        const compName = String(target.component != null ? target.component : "").trim();
        const props = (target.properties && typeof target.properties === "object")
            ? target.properties
            : {};
        const propEntries = Object.keys(props).map((k) => ({
            key: k.trim(),
            raw: props[k],
        })).filter((x) => x.key.length > 0);
        const propKeys = propEntries.map((x) => x.key);
        /** @type {Record<string, { ok: boolean, reason?: string }>} */
        const keyReport = {};
        let componentKnown = false;
        let classFields = new Set();
        let onScene = false;
        let componentOk = false;
        if (!compName) {
            componentOk = false;
            for (const pe of propEntries) {
                keyReport[pe.key] = { ok: false, reason: "noComponent" };
            }
        }
        else {
            const filePath = resolveComponentFilePath(compName, nameIndex);
            if (!filePath) {
                componentOk = false;
                for (const pe of propEntries) {
                    keyReport[pe.key] = { ok: false, reason: "unknownClass" };
                }
            }
            else {
                componentKnown = true;
                let src = "";
                try {
                    src = fs.readFileSync(filePath, "utf8");
                }
                catch (_e) {
                    src = "";
                }
                classFields = extractAssignableFieldNames(src);
                const sceneKs = pickSceneKeySetForClass(classFields, sceneSets);
                onScene = sceneKs != null;
                componentOk = true;
                for (const pe of propEntries) {
                    const k = pe.key;
                    if (!classFields.has(k)) {
                        keyReport[k] = { ok: false, reason: "notOnClass" };
                    }
                    else if (!sceneKs) {
                        // Scene matching in Cocos can be ambiguous (serialized aliases / stripped keys).
                        // If class field exists but scene probe is inconclusive, do not hard-fail.
                        keyReport[k] = { ok: true, reason: "sceneUnknown" };
                    }
                    else if (!sceneKs.has(k)) {
                        // In Cocos scene JSON, some fields may be omitted (default/serialization behavior).
                        // If class field exists, don't mark it invalid solely by missing serialized key.
                        keyReport[k] = { ok: true, reason: "sceneMissingKey" };
                    }
                    else {
                        keyReport[k] = { ok: true };
                    }
                }
            }
        }
        items.push({
            folder: (it && it.folder) != null ? String(it.folder) : "",
            component: compName,
            componentKnown,
            onScene,
            componentOk,
            keys: keyReport,
        });
    }
    return {
        ok: true,
        items,
        sceneComponentCount: sceneSets.length,
        sceneFileCount: walkFiles(path.join(projectPath, "assets"), [".scene"]).length,
    };
}
