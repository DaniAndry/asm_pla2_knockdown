"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMraidLifecycleScript = void 0;
/**
 * Runs before resource extraction. Network adapters remain responsible for CTA
 * and vendor callbacks; this controller owns the shared start/viewability flow.
 */
function createMraidLifecycleScript(provider) {
    const apiExpression = provider === 'bigo' ? 'window.BGY_MRAID' : 'window.mraid';
    return `
    (function cgbInstallMraidLifecycle() {
      var api = ${apiExpression};
      var ready = false;
      var started = false;
      var viewable = false;
      var listenersInstalled = false;
      var dispatchingNetworkResize = false;

      function setAudio(enabled) {
        if (typeof window.super_html_change_audio === 'function') {
          window.super_html_change_audio(Boolean(enabled));
        }
      }
      function syncViewport(size) {
        if (size && typeof size === 'object') window.screenSize = size;
        else window.screenSize = { width: window.innerWidth, height: window.innerHeight };
      }
      function startOnce() {
        if (!ready || !viewable || started) return;
        started = true;
        window.__cgbStart();
      }
      function onViewable(value) {
        viewable = Boolean(value);
        if (!viewable) setAudio(false);
        startOnce();
      }
      function onExposure(value) {
        if (typeof value === 'number') {
          onViewable(value > 0);
          return;
        }
        if (!value || typeof value !== 'object') return;
        if (typeof value.exposedPercentage === 'number') {
          onViewable(value.exposedPercentage > 0);
        }
      }
      function onSize(width, height) {
        var size = typeof width === 'object' ? width : { width: width, height: height };
        syncViewport(size);
        dispatchingNetworkResize = true;
        try { window.dispatchEvent(new Event('resize')); }
        finally { dispatchingNetworkResize = false; }
      }
      function installListeners() {
        if (listenersInstalled) return;
        listenersInstalled = true;
        window.addEventListener('resize', function () {
          if (!dispatchingNetworkResize) syncViewport();
        });
        window.addEventListener('orientationchange', function () {
          syncViewport();
          window.dispatchEvent(new Event('resize'));
        });
        if (!api || typeof api.addEventListener !== 'function') return;
        try { api.addEventListener('viewableChange', onViewable); } catch (error) {}
        try { api.addEventListener('exposureChange', onExposure); } catch (error) {}
        try { api.addEventListener('sizeChange', onSize); } catch (error) {}
        try {
          api.addEventListener('audioVolumeChange', function (volume) {
            setAudio(Number(volume) > 0 && viewable);
          });
        } catch (error) {}
      }
      function onReady() {
        ready = true;
        installListeners();
        syncViewport();
        try {
          if (api && typeof api.isViewable === 'function') onViewable(api.isViewable());
          else if (api && typeof api.isVisible === 'function') onViewable(api.isVisible());
          else onViewable(true);
        } catch (error) { onViewable(true); }
      }

      if (!api) {
        ready = true;
        viewable = true;
        installListeners();
        startOnce();
        return;
      }
      var loading = false;
      try {
        loading = (typeof api.getState === 'function' && api.getState() === 'loading')
          || (typeof api.isReady === 'function' && !api.isReady());
      }
      catch (error) {}
      if (loading) {
        if (typeof api.addEventListener === 'function') api.addEventListener('ready', onReady);
        return;
      }
      onReady();
    }());
  `;
}
exports.createMraidLifecycleScript = createMraidLifecycleScript;
