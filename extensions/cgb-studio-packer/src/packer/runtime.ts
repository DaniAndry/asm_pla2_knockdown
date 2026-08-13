export function getBrowserRuntimeSource(): string {
  function browserRuntime(): void {
    const root = window as any;
    const nativeFetch = root.fetch ? root.fetch.bind(root) : undefined;
    const NativeXMLHttpRequest = root.XMLHttpRequest;
    const blobUrls = new Map<string, string>();
    const resources = new Map<string, {
      path: string;
      mime: string;
      type: 'text' | 'binary';
      text?: string;
      bytes?: Uint8Array;
    }>();
    const missing = new Set<string>();
    let booted = false;

    root.super_log = (...values: unknown[]) => console.log('[CGB Studio packer]', ...values);
    root.super_check_channel = (value: unknown) => {
      if (!value) {
        console.warn(`[CGB Studio packer] ${root.super_html_channel || 'common'} API is unavailable; preview mode is used.`);
        return false;
      }
      return true;
    };

    function stripUrl(value: string): string {
      let normalized = String(value || '').replace(/\\/g, '/');
      if (normalized.startsWith('cgb://')) {
        normalized = normalized.slice('cgb://'.length);
      }
      // iOS ad preview apps commonly host inline playables in an iframe whose
      // document URL is about:srcdoc. SystemJS then resolves relative imports
      // such as ./index.js to about:index.js instead of a normal path. Treat
      // that pseudo-protocol as another local-resource prefix so the resolved
      // value can still match the embedded resource manifest.
      if (/^about:/i.test(normalized)) {
        normalized = normalized.slice('about:'.length).replace(/^srcdoc\/?/i, '');
      }
      normalized = normalized.split('?')[0].split('#')[0];
      try {
        normalized = decodeURIComponent(normalized);
      } catch (error) {}
      try {
        const parsed = new URL(normalized, root.location.href);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:') {
          normalized = parsed.pathname;
        }
      } catch (error) {}
      while (normalized.startsWith('../')) normalized = normalized.slice(3);
      while (normalized.startsWith('./')) normalized = normalized.slice(2);
      while (normalized.startsWith('/')) normalized = normalized.slice(1);
      return normalized;
    }

    function resolvePath(value: string, base = ''): string {
      const raw = stripUrl(value);
      if (!base || value.startsWith('cgb://')) return raw;
      const baseParts = stripUrl(base).split('/');
      baseParts.pop();
      for (const part of raw.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') baseParts.pop();
        else baseParts.push(part);
      }
      return baseParts.join('/');
    }

    function findResource(value: string, base = ''): {
      path: string;
      mime: string;
      type: 'text' | 'binary';
      text?: string;
      bytes?: Uint8Array;
    } | undefined {
      const rawValue = String(value || '');
      if (/^(?:blob:|data:|javascript:|#)/i.test(rawValue)) {
        return undefined;
      }
      const isNetworkUrl = /^(?:https?:)?\/\//i.test(rawValue);
      const candidates = [
        resolvePath(value, base),
        stripUrl(value),
      ].filter(Boolean);
      for (const candidate of candidates) {
        const direct = resources.get(candidate);
        if (direct) return direct;
      }
      for (const [key, entry] of resources) {
        for (const candidate of candidates) {
          if (key === candidate || key.endsWith(`/${candidate}`) || candidate.endsWith(`/${key}`)) {
            return entry;
          }
        }
      }
      if (isNetworkUrl) return undefined;
      // Emscripten derives auxiliary .mem/.wasm URLs from document.currentScript.
      // Since packed scripts are evaluated from memory, that value may point at
      // the network output directory and omit a manifest prefix such as
      // "cocos-js/". Resolve the longest trailing path that identifies exactly
      // one embedded resource. Ambiguous suffixes remain genuine misses.
      const suffixes = new Set<string>();
      for (const candidate of candidates) {
        const parts = candidate.split('/').filter(Boolean);
        for (let index = 0; index <= parts.length - 2; index += 1) {
          suffixes.add(parts.slice(index).join('/'));
        }
      }
      for (const suffix of Array.from(suffixes).sort((first, second) => second.length - first.length)) {
        const matches = Array.from(resources.entries())
          .filter(([key]) => key === suffix || key.endsWith(`/${suffix}`));
        if (matches.length === 1) return matches[0][1];
      }
      const missingKey = String(value);
      if (!missing.has(missingKey)) {
        missing.add(missingKey);
        console.error('[CGB Studio packer] missing resource', {
          url: value,
          candidates,
          resources: Array.from(resources.keys()).slice(0, 80),
        });
      }
      return undefined;
    }

    function entryBytes(entry: ReturnType<typeof findResource>): Uint8Array {
      if (!entry) return new Uint8Array();
      if (entry.bytes) return entry.bytes;
      return new TextEncoder().encode(entry.text || '');
    }

    function entryText(entry: ReturnType<typeof findResource>): string {
      if (!entry) return '';
      if (typeof entry.text === 'string') return entry.text;
      return new TextDecoder().decode(entry.bytes || new Uint8Array());
    }

    function arrayBufferOf(bytes: Uint8Array): ArrayBuffer {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    }

    function blobUrl(value: string, base = ''): string | undefined {
      const entry = findResource(value, base);
      if (!entry) return undefined;
      const cached = blobUrls.get(entry.path);
      if (cached) return cached;
      const url = URL.createObjectURL(new Blob([entryBytes(entry)], { type: entry.mime }));
      blobUrls.set(entry.path, url);
      return url;
    }

    root.getRes = (value: string) => {
      const entry = findResource(value);
      return entry?.type === 'text' ? entryText(entry) : blobUrl(value);
    };

    function decodeBase122(value: string): Uint8Array {
      const illegal = [0, 10, 13, 34, 38, 92];
      const output: number[] = [];
      let currentByte = 0;
      let bitOfByte = 0;
      const pushSeven = (input: number) => {
        const aligned = input << 1;
        currentByte |= aligned >>> bitOfByte;
        bitOfByte += 7;
        if (bitOfByte >= 8) {
          output.push(currentByte & 255);
          bitOfByte -= 8;
          currentByte = (aligned << (7 - bitOfByte)) & 255;
        }
      };
      for (let index = 0; index < value.length; index += 1) {
        const codePoint = value.charCodeAt(index);
        if (codePoint > 127) {
          const illegalIndex = (codePoint >>> 8) & 7;
          if (illegalIndex !== 7) pushSeven(illegal[illegalIndex]);
          pushSeven(codePoint & 127);
        } else {
          pushSeven(codePoint);
        }
      }
      return Uint8Array.from(output);
    }

    function decodePayload(): Uint8Array {
      if (root.__CGB_ENCODING__ === 'base122') {
        return decodeBase122(root.__CGB_PAYLOAD__);
      }
      const binary = atob(root.__CGB_PAYLOAD__);
      const output = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        output[index] = binary.charCodeAt(index);
      }
      return output;
    }

    function rewriteCss(css: string, base: string): string {
      return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (match, quote, rawValue) => {
        const value = String(rawValue || '').trim();
        if (!value || /^(?:https?:|blob:|data:|#)/i.test(value)) return match;
        const resolved = blobUrl(value, base);
        return resolved ? `url("${resolved}")` : match;
      });
    }

    function installDynamicStyleInterceptors(): void {
      if (root.__cgbStyleInterceptorsInstalled) return;
      root.__cgbStyleInterceptorsInstalled = true;

      const isStyle = (value: any): value is HTMLStyleElement =>
        Boolean(value && String(value.tagName || '').toUpperCase() === 'STYLE');
      const rewriteStyle = (style: HTMLStyleElement): void => {
        const source = style.textContent || '';
        const rewritten = rewriteCss(source, style.dataset?.cgbBase || '');
        if (rewritten !== source) style.textContent = rewritten;
      };
      const rewriteTree = (node: any): void => {
        if (isStyle(node)) rewriteStyle(node);
        if (!node?.querySelectorAll) return;
        for (const style of Array.from(node.querySelectorAll('style'))) {
          rewriteStyle(style as HTMLStyleElement);
        }
      };
      const rewriteInsertedNode = (parent: any, node: any): void => {
        if (isStyle(parent) && node?.nodeType === 3) {
          const source = String(node.textContent || '');
          const rewritten = rewriteCss(source, parent.dataset?.cgbBase || '');
          if (rewritten !== source) node.textContent = rewritten;
        }
        rewriteTree(node);
      };

      const nodePrototype = root.Node?.prototype;
      if (nodePrototype) {
        const nativeAppendChild = nodePrototype.appendChild;
        const nativeInsertBefore = nodePrototype.insertBefore;
        const nativeReplaceChild = nodePrototype.replaceChild;
        nodePrototype.appendChild = function appendChild(node: any) {
          rewriteInsertedNode(this, node);
          return nativeAppendChild.call(this, node);
        };
        nodePrototype.insertBefore = function insertBefore(node: any, reference: any) {
          rewriteInsertedNode(this, node);
          return nativeInsertBefore.call(this, node, reference);
        };
        nodePrototype.replaceChild = function replaceChild(node: any, previous: any) {
          rewriteInsertedNode(this, node);
          return nativeReplaceChild.call(this, node, previous);
        };
      }

      const patchStyleProperty = (prototype: any, property: string): void => {
        if (!prototype) return;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
        if (!descriptor?.get || !descriptor.set) return;
        Object.defineProperty(prototype, property, {
          configurable: true,
          enumerable: descriptor.enumerable,
          get: descriptor.get,
          set(value: unknown) {
            const next = isStyle(this) && typeof value === 'string'
              ? rewriteCss(value, (this as HTMLStyleElement).dataset?.cgbBase || '')
              : value;
            descriptor.set!.call(this, next);
          },
        });
      };
      patchStyleProperty(root.Node?.prototype, 'textContent');
      patchStyleProperty(root.Element?.prototype, 'innerHTML');

      const sheetPrototype = root.CSSStyleSheet?.prototype;
      if (sheetPrototype?.insertRule) {
        const nativeInsertRule = sheetPrototype.insertRule;
        sheetPrototype.insertRule = function insertRule(rule: string, index?: number) {
          const owner = (this as any).ownerNode as HTMLStyleElement | undefined;
          const rewritten = rewriteCss(rule, owner?.dataset?.cgbBase || '');
          return index === undefined
            ? nativeInsertRule.call(this, rewritten)
            : nativeInsertRule.call(this, rewritten, index);
        };
      }

      if (root.MutationObserver) {
        const observer = new root.MutationObserver((records: MutationRecord[]) => {
          for (const record of records) {
            if (isStyle(record.target)) rewriteStyle(record.target);
            for (const node of Array.from(record.addedNodes || [])) rewriteTree(node);
          }
        });
        observer.observe(document.documentElement, {
          childList: true,
          characterData: true,
          subtree: true,
        });
        root.__cgbStyleObserver = observer;
      }
    }

    function installStyles(): void {
      for (const path of root.__CGB_STYLESHEETS__ || []) {
        const entry = findResource(path);
        if (!entry) continue;
        const style = document.createElement('style');
        style.setAttribute('data-cgb-source', path);
        style.textContent = rewriteCss(entryText(entry), path);
        document.head.appendChild(style);
      }
      for (const style of Array.from(document.querySelectorAll('style'))) {
        const element = style as HTMLStyleElement;
        element.textContent = rewriteCss(element.textContent || '', element.dataset.cgbBase || '');
      }
    }

    function installDomResourceAttributes(): void {
      const attributes = ['src', 'poster', 'href'];
      for (const element of Array.from(document.querySelectorAll('[data-cgb-resource]'))) {
        const target = element as HTMLElement;
        const attribute = target.dataset.cgbAttribute || 'src';
        const path = target.dataset.cgbResource || '';
        const resolved = blobUrl(path);
        if (resolved) target.setAttribute(attribute, resolved);
      }
      for (const element of Array.from(document.querySelectorAll('[src^="cgb://"],[poster^="cgb://"],[href^="cgb://"]'))) {
        for (const attribute of attributes) {
          const value = element.getAttribute(attribute);
          if (!value || !value.startsWith('cgb://')) continue;
          const resolved = blobUrl(value);
          if (resolved) element.setAttribute(attribute, resolved);
        }
      }
    }

    function patchUrlProperty(prototype: any, property: string): void {
      if (!prototype) return;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, property);
      if (!descriptor?.set || !descriptor.get) return;
      Object.defineProperty(prototype, property, {
        configurable: true,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set(value: string) {
          const resolved = typeof value === 'string' ? blobUrl(value) : undefined;
          descriptor.set!.call(this, resolved || value);
        },
      });
    }

    function installElementInterceptors(): void {
      patchUrlProperty(root.HTMLImageElement?.prototype, 'src');
      patchUrlProperty(root.HTMLMediaElement?.prototype, 'src');
      root._createLocalJSElement = () => {
        const element = document.createElement('script') as any;
        let source = '';
        Object.defineProperty(element, 'src', {
          configurable: true,
          get: () => source,
          set: (value: string) => { source = value; },
        });
        // SystemJS assigns crossorigin="anonymous" to file:// module URLs.
        // A real script element with that attribute makes Chromium attempt a
        // forbidden file-origin load even though CGB evaluates it from memory.
        for (const property of ['crossOrigin', 'integrity']) {
          let value = '';
          Object.defineProperty(element, property, {
            configurable: true,
            get: () => value,
            set: (next: string) => { value = next; },
          });
        }
        const nativeAddEventListener = element.addEventListener.bind(element);
        element.addEventListener = (type: string, listener: (...args: unknown[]) => void, options?: unknown) => {
          if (type !== 'load') {
            nativeAddEventListener(type, listener, options);
            return;
          }
          setTimeout(() => {
            evaluateResource(source);
            listener.call(element, new Event('load'));
          }, 0);
        };
        return element;
      };
    }

    function installFetch(): void {
      if (!nativeFetch) return;
      root.fetch = async (input: unknown, init?: unknown) => {
        const url = typeof input === 'string' ? input : (input as any)?.url;
        const entry = typeof url === 'string' ? findResource(url) : undefined;
        if (!entry) return nativeFetch(input, init);
        return new Response(entryBytes(entry), {
          status: 200,
          headers: { 'Content-Type': entry.mime },
        });
      };
    }

    function installXhr(): void {
      class LocalXMLHttpRequest {
        readyState = 0;
        status = 0;
        responseType: XMLHttpRequestResponseType = '';
        response: unknown = null;
        responseText = '';
        onload: ((event: Event) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        onreadystatechange: ((event: Event) => void) | null = null;
        private method = 'GET';
        private url = '';
        private async = true;
        private listeners = new Map<string, Array<(event: Event) => void>>();
        private headers: Record<string, string> = {};

        open(method: string, url: string, async = true): void {
          this.method = method;
          this.url = url;
          this.async = async;
          this.readyState = 1;
          this.emit('readystatechange');
        }

        addEventListener(type: string, listener: (event: Event) => void): void {
          const listeners = this.listeners.get(type) || [];
          listeners.push(listener);
          this.listeners.set(type, listeners);
        }

        removeEventListener(type: string, listener: (event: Event) => void): void {
          this.listeners.set(type, (this.listeners.get(type) || []).filter((item) => item !== listener));
        }

        setRequestHeader(name: string, value: string): void {
          this.headers[name] = value;
        }

        overrideMimeType(): void {}

        getResponseHeader(name: string): string | null {
          const entry = findResource(this.url);
          return name.toLowerCase() === 'content-type' && entry ? entry.mime : null;
        }

        getAllResponseHeaders(): string {
          const entry = findResource(this.url);
          return entry ? `content-type: ${entry.mime}\r\n` : '';
        }

        send(body?: Document | XMLHttpRequestBodyInit | null): void {
          const entry = findResource(this.url);
          if (!entry) {
            const native = new NativeXMLHttpRequest();
            native.open(this.method, this.url, this.async);
            native.responseType = this.responseType;
            for (const [name, value] of Object.entries(this.headers)) native.setRequestHeader(name, value);
            native.onload = () => {
              this.status = native.status;
              this.readyState = native.readyState;
              this.response = native.response;
              this.responseText = native.responseType === '' || native.responseType === 'text'
                ? native.responseText
                : '';
              this.emit('readystatechange');
              this.emit('load');
            };
            native.onerror = () => this.emit('error');
            native.send(body as any);
            return;
          }

          const bytes = entryBytes(entry);
          const text = entryText(entry);
          switch (this.responseType) {
            case 'arraybuffer':
              this.response = arrayBufferOf(bytes);
              break;
            case 'blob':
              this.response = new Blob([bytes], { type: entry.mime });
              break;
            case 'json':
              this.response = JSON.parse(text);
              break;
            case 'text':
            case '':
              this.response = text;
              this.responseText = text;
              break;
            default:
              this.response = arrayBufferOf(bytes);
          }
          this.status = 200;
          this.readyState = 4;
          const complete = () => {
            this.emit('readystatechange');
            this.emit('load');
          };
          if (this.async) setTimeout(complete, 0);
          else complete();
        }

        abort(): void {}

        private emit(type: string): void {
          const event = new Event(type);
          for (const listener of this.listeners.get(type) || []) listener.call(this, event);
          const handler = (this as any)[`on${type}`];
          if (typeof handler === 'function') handler.call(this, event);
        }
      }
      root._CGBLocalXMLHttpRequest = LocalXMLHttpRequest;
      root._XMLLocalRequest = LocalXMLHttpRequest;
      root.XMLHttpRequest = LocalXMLHttpRequest;
    }

    root._CGB_URL = function CgbUrl(value: string, base: string) {
      const entry = findResource(value, base);
      if (entry) return { href: entry.path, toString: () => entry.path };
      return new URL(value, base);
    };

    function evaluateScript(source: string, sourceName: string): void {
      if (!source) return;
      (0, eval)(`${source}\n//# sourceURL=cgb://${sourceName}`);
    }

    function evaluateResource(path: string): void {
      const entry = findResource(path);
      if (entry) evaluateScript(entryText(entry), entry.path);
    }

    async function bootEngine(): Promise<void> {
      if (booted) return;
      booted = true;
      root.super_log('boot engine');
      for (const action of root.__CGB_STARTUP__ || []) {
        if (action.type === 'script') evaluateResource(action.value);
        else evaluateScript(action.value, 'inline-startup.js');
        await Promise.resolve();
      }
    }
    root.super_boot_engine = bootEngine;

    async function start(): Promise<void> {
      try {
        console.time('[CGB Studio packer] unpack');
        const archive = await root.JSZip.loadAsync(decodePayload());
        const manifest = JSON.parse(await archive.file('__cgb_manifest__.json').async('string'));
        for (const item of manifest.entries) {
          const file = archive.file(item.archivePath);
          if (!file) throw new Error(`Resource is missing from archive: ${item.path}`);
          if (item.type === 'text') {
            resources.set(item.path, {
              path: item.path,
              mime: item.mime,
              type: item.type,
              text: await file.async('string'),
            });
          } else {
            resources.set(item.path, {
              path: item.path,
              mime: item.mime,
              type: item.type,
              bytes: await file.async('uint8array'),
            });
          }
        }
        console.timeEnd('[CGB Studio packer] unpack');
        root.__cgbResources = resources;
        installDynamicStyleInterceptors();
        installElementInterceptors();
        installFetch();
        installXhr();
        installStyles();
        installDomResourceAttributes();
        root.super_log(`channel: ${root.super_html_channel || 'common'}`);
        if (root.super_html?.game_ready) root.super_html.game_ready();
        else await bootEngine();
      } catch (error) {
        console.error('[CGB Studio packer] Unable to start playable', error);
        const message = document.createElement('pre');
        message.style.cssText = 'position:fixed;inset:0;z-index:999999;margin:0;padding:16px;background:#250b0b;color:#ffb4b4;white-space:pre-wrap;';
        message.textContent = `[CGB Studio packer] ${error instanceof Error ? error.stack || error.message : String(error)}`;
        document.body.appendChild(message);
        throw error;
      }
    }

    root.__cgbStart = start;
  }

  return `(${browserRuntime.toString()})();`;
}
