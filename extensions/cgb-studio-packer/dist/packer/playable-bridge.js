"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPlayableBridgeSource = void 0;
/**
 * Compatibility facade for projects that use super_html_playable.ts.
 *
 * Network adapters own the actual SDK calls. This facade only guarantees the
 * stable project-facing API and never replaces a method supplied by a target.
 */
function getPlayableBridgeSource() {
    return String.raw `
    (function installCgbPlayableBridge() {
      // The adapter runs immediately before this bridge. Use its object as the
      // canonical API so target-specific CTA and lifecycle behavior is kept.
      var previous = window.cgb || {};
      var api = window.super_html || previous;
      if (api !== previous) {
        if (!api.google_play_url && previous.google_play_url) api.google_play_url = previous.google_play_url;
        if (!api.appstore_url && previous.appstore_url) api.appstore_url = previous.appstore_url;
      }

      if (typeof api.download !== 'function') {
        api.download = function (url) {
          var target = url || (/android/i.test(navigator.userAgent || navigator.vendor || '')
            ? api.google_play_url
            : api.appstore_url);
          if (target) {
            if (window.mraid && typeof window.mraid.open === 'function') window.mraid.open(target);
            else window.open(target, '_blank');
          } else {
            console.error('[CGB Studio packer] Store URL is not configured.');
          }
        };
      }

      if (typeof api.game_end !== 'function') {
        api.game_end = function () {
          if (typeof window.gameEnd === 'function') window.gameEnd();
        };
      }

      if (typeof api.gameEnd !== 'function') {
        api.gameEnd = function () { return api.game_end(); };
      }

      if (typeof api.game_ready !== 'function') {
        api.game_ready = function () {};
      }

      if (typeof api.gameReady !== 'function') {
        api.gameReady = function () { return api.game_ready(); };
      }

      if (typeof api.is_hide_download !== 'function') {
        api.is_hide_download = function () { return false; };
      }

      if (typeof api.isDownloadHidden !== 'function') {
        api.isDownloadHidden = function () { return api.is_hide_download(); };
      }

      if (typeof api.setGooglePlayUrl !== 'function') {
        api.setGooglePlayUrl = function (url) { api.google_play_url = String(url || ''); };
      }

      if (typeof api.setAppStoreUrl !== 'function') {
        api.setAppStoreUrl = function (url) { api.appstore_url = String(url || ''); };
      }

      window.cgb = api;
      window.super_html = api;
      window.super_html_playable = {
        download: function (url) { return window.cgb.download(url); },
        game_end: function () { return window.cgb.game_end(); },
        game_ready: function () { return window.cgb.game_ready(); },
        is_hide_download: function () { return window.cgb.is_hide_download(); },
        set_google_play_url: function (url) { return window.cgb.setGooglePlayUrl(url); },
        set_app_store_url: function (url) { return window.cgb.setAppStoreUrl(url); }
      };
    })();
  `;
}
exports.getPlayableBridgeSource = getPlayableBridgeSource;
