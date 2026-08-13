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
exports.createHtmlShell = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const cheerio_1 = require("cheerio");
const resources_1 = require("./resources");
function isExternalUrl(value) {
    return /^(?:[a-z]+:)?\/\//i.test(value)
        || /^(?:data:|blob:|javascript:|#)/i.test(value);
}
function localResourcePath(value) {
    return (0, resources_1.normalizeResourcePath)(value.replace(/^\//, ''));
}
function resolveImportMapPath(value, importMapPath) {
    if (!/^(?:\.{1,2}\/|\/)/.test(value))
        return value;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(importMapPath), value.replace(/^\//, '')));
    return `./${resolved.replace(/^\.\//, '')}`;
}
function inlineImportMap(source, importMapPath) {
    const value = JSON.parse(source);
    for (const imports of [
        value.imports,
        ...Object.values(value.scopes || {}),
    ]) {
        if (!imports)
            continue;
        for (const [key, target] of Object.entries(imports)) {
            imports[key] = resolveImportMapPath(target, importMapPath);
        }
    }
    return JSON.stringify(value);
}
function createHtmlShell(inputDirectory, collector) {
    const indexPath = path.join(inputDirectory, 'index.html');
    if (!fs.existsSync(indexPath)) {
        throw new Error(`index.html was not found in ${inputDirectory}`);
    }
    const source = collector.processHtmlText(fs.readFileSync(indexPath, 'utf8'));
    const $ = (0, cheerio_1.load)(source, { decodeEntities: false });
    const title = $('title').first().text().trim();
    const startup = [];
    const stylesheets = [];
    $('script').each((_index, element) => {
        const script = $(element);
        const sourcePath = script.attr('src');
        const type = (script.attr('type') || '').toLowerCase();
        if (sourcePath) {
            if (isExternalUrl(sourcePath))
                return;
            const normalized = localResourcePath(sourcePath);
            if (['importmap', 'systemjs-importmap'].includes(type)) {
                const importMap = collector.getText(normalized);
                if (importMap !== undefined) {
                    script.removeAttr('src');
                    script.text(inlineImportMap(importMap, normalized));
                }
                return;
            }
            if (collector.has(normalized)) {
                startup.push({ type: 'script', value: normalized });
                script.remove();
            }
            return;
        }
        if (type && !['text/javascript', 'application/javascript', 'module'].includes(type)) {
            return;
        }
        const content = script.html() || '';
        if (content.trim()) {
            startup.push({ type: 'inline', value: collector.processInlineScript(content) });
        }
        script.remove();
    });
    $('link[rel~="stylesheet"]').each((_index, element) => {
        const link = $(element);
        const href = link.attr('href');
        if (!href || isExternalUrl(href))
            return;
        const normalized = localResourcePath(href);
        if (collector.has(normalized)) {
            stylesheets.push(normalized);
            link.remove();
        }
    });
    $('style').each((_index, element) => {
        const style = $(element);
        style.attr('data-cgb-base', '');
        style.text(collector.processHtmlText(style.html() || ''));
    });
    const resourceAttributes = ['src', 'poster'];
    $('[src],[poster]').each((_index, element) => {
        const target = $(element);
        for (const attribute of resourceAttributes) {
            const value = target.attr(attribute);
            if (!value || isExternalUrl(value))
                continue;
            const normalized = localResourcePath(value);
            if (!collector.has(normalized))
                continue;
            target.attr('data-cgb-resource', normalized);
            target.attr('data-cgb-attribute', attribute);
            target.removeAttr(attribute);
        }
    });
    return {
        html: $.html(),
        title,
        startup,
        stylesheets,
    };
}
exports.createHtmlShell = createHtmlShell;
