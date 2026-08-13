import * as fs from 'fs';
import * as path from 'path';
import { load as loadHtml } from 'cheerio';
import { HtmlShell, StartupAction } from '../types';
import { normalizeResourcePath, ResourceCollector } from './resources';

function isExternalUrl(value: string): boolean {
  return /^(?:[a-z]+:)?\/\//i.test(value)
    || /^(?:data:|blob:|javascript:|#)/i.test(value);
}

function localResourcePath(value: string): string {
  return normalizeResourcePath(value.replace(/^\//, ''));
}

function resolveImportMapPath(value: string, importMapPath: string): string {
  if (!/^(?:\.{1,2}\/|\/)/.test(value)) return value;
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(importMapPath), value.replace(/^\//, '')),
  );
  return `./${resolved.replace(/^\.\//, '')}`;
}

function inlineImportMap(source: string, importMapPath: string): string {
  const value = JSON.parse(source) as {
    imports?: Record<string, string>;
    scopes?: Record<string, Record<string, string>>;
  };
  for (const imports of [
    value.imports,
    ...Object.values(value.scopes || {}),
  ]) {
    if (!imports) continue;
    for (const [key, target] of Object.entries(imports)) {
      imports[key] = resolveImportMapPath(target, importMapPath);
    }
  }
  return JSON.stringify(value);
}

export function createHtmlShell(inputDirectory: string, collector: ResourceCollector): HtmlShell {
  const indexPath = path.join(inputDirectory, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`index.html was not found in ${inputDirectory}`);
  }

  const source = collector.processHtmlText(fs.readFileSync(indexPath, 'utf8'));
  const $ = loadHtml(source, { decodeEntities: false });
  const title = $('title').first().text().trim();
  const startup: StartupAction[] = [];
  const stylesheets: string[] = [];

  $('script').each((_index, element) => {
    const script = $(element);
    const sourcePath = script.attr('src');
    const type = (script.attr('type') || '').toLowerCase();
    if (sourcePath) {
      if (isExternalUrl(sourcePath)) return;
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
    if (!href || isExternalUrl(href)) return;
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
      if (!value || isExternalUrl(value)) continue;
      const normalized = localResourcePath(value);
      if (!collector.has(normalized)) continue;
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
