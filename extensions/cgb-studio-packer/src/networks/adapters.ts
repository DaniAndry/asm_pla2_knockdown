import { GOOGLE_EXIT_API_URL } from '../constants';
import { NetworkId } from '../types';
import { MraidProvider } from './mraid-lifecycle';

export interface NetworkAdapter {
  id: NetworkId | 'common';
  label: string;
  script: string;
  headHtml?: string;
  mraid?: MraidProvider;
}

const MRAID_HEAD = '<script src="mraid.js"></script>';

export interface UnityStoreUrls {
  googlePlayUrl?: string;
  appStoreUrl?: string;
}

const mraidDownload = `
  window.super_html = {
    download: function (url) {
      super_log('game download');
      var target = url || (/android/i.test(navigator.userAgent || navigator.vendor)
        ? window.super_html.google_play_url
        : window.super_html.appstore_url);
      if (window.mraid && typeof window.mraid.open === 'function') {
        window.mraid.open(target);
      } else if (target) {
        window.open(target, '_blank');
      }
    },
    game_ready: function () {
      super_log('game ready');
      super_check_channel(window.mraid);
      super_boot_engine();
    }
  };
`;

const dapiBootstrap = `
  <script type="text/javascript">
    (function () {
      var eventPool = {};
      var DOLLAR_PREFIX = '$$';
      var RECEIVE_PREFIX = 'DAPI_SERVICE:';
      var SEND_PREFIX = 'DAPI_AD:';
      function addScript(url, callback) {
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.async = true;
        script.onload = callback;
        script.src = url;
        document.head.appendChild(script);
      }
      function connectDemoDapi(event) {
        var data = event && event.data;
        if (typeof data !== 'string') return;
        var marker = DOLLAR_PREFIX + RECEIVE_PREFIX;
        var markerIndex = data.indexOf(marker);
        if (markerIndex < 0) return;
        try {
          var payload = data.slice(markerIndex + marker.length);
          var message;
          try {
            message = JSON.parse(payload);
          } catch (jsonError) {
            var values = payload.split('/');
            message = {};
            for (var index = 0; index + 1 < values.length; index += 2) {
              message[values[index]] = decodeURIComponent(values[index + 1]);
            }
          }
          if (message.name !== 'connection.getDapiUrl' || !message.data) return;
          addScript(message.data, function () {
            window.removeEventListener('message', connectDemoDapi);
            Object.keys(eventPool).forEach(function (name) {
              window.dapi.addEventListener(name, eventPool[name]);
            });
          });
        } catch (error) {
          console.error('[CGB Studio packer] Invalid DAPI service message.', error);
        }
      }
      window.dapi = window.dapi || {
        isReady: function () { return true; },
        addEventListener: function (name, callback) { eventPool[name] = callback; },
        removeEventListener: function (name) { delete eventPool[name]; },
        getScreenSize: function () { return { width: innerWidth, height: innerHeight }; },
        getAudioVolume: function () { return 100; },
        isViewable: function () { return true; },
        isDemoDapi: true
      };
      if (window.dapi.isDemoDapi) {
        window.parent.postMessage(
          DOLLAR_PREFIX + SEND_PREFIX + JSON.stringify({ state: 'getDapiUrl' }),
          '*'
        );
        window.addEventListener('message', connectDemoDapi, false);
      }
    }());
  </script>
`;

function createMraidAdapterScript(platform: string, label: string): string {
  return `
    window.nameplatform = ${JSON.stringify(platform)};
    window.super_html = {
      download: function (url) {
        super_log('game download');
        var target = url || (/android/i.test(navigator.userAgent || navigator.vendor)
          ? window.super_html.google_play_url
          : window.super_html.appstore_url);
        if (window.mraid && typeof window.mraid.open === 'function') {
          window.mraid.open(target);
        } else if (target) {
          window.open(target, '_blank');
        }
      },
      game_ready: function () {
        super_log(${JSON.stringify(`${label} ready`)});
        super_check_channel(window.mraid);
        super_boot_engine();
      },
      game_end: function () {
        if (window.gameEnd) window.gameEnd();
      }
    };
  `;
}

export function createUnityAdapterScript(storeUrls: UnityStoreUrls = {}): string {
  const googlePlayUrl = storeUrls.googlePlayUrl || '';
  const appStoreUrl = storeUrls.appStoreUrl || '';
  if (!googlePlayUrl && !appStoreUrl) {
    throw new Error(
      'Unity target requires a valid Google Play or App Store URL in the web-mobile build. '
      + 'Configure it from a project script through AdsManager or super_html_playable before packing.',
    );
  }
  const googleLiteral = JSON.stringify(googlePlayUrl);
  const appStoreLiteral = JSON.stringify(appStoreUrl);
  const androidMraidOpen = googlePlayUrl
    ? `if (target && target !== ${googleLiteral}) window.mraid.open(target);
            else window.mraid.open(${googleLiteral});`
    : `if (target) window.mraid.open(target); else window.mraid.open();`;
  const iosMraidOpen = appStoreUrl
    ? `if (target && target !== ${appStoreLiteral}) window.mraid.open(target);
            else window.mraid.open(${appStoreLiteral});`
    : `if (target) window.mraid.open(target); else window.mraid.open();`;
  return `
    window.nameplatform = 'unity';
    var cgbUnityPrevious = window.super_html || {};
    window.super_html = {
      google_play_url: cgbUnityPrevious.google_play_url || ${googleLiteral},
      appstore_url: cgbUnityPrevious.appstore_url || ${appStoreLiteral},
      download: function (url) {
        super_log('game download');
        var isAndroid = /android/i.test(navigator.userAgent || navigator.vendor);
        var target = url || (isAndroid
          ? window.super_html.google_play_url
          : window.super_html.appstore_url);
        if (window.mraid && typeof window.mraid.open === 'function') {
          if (url) {
            window.mraid.open(url);
          } else if (isAndroid) {
            ${androidMraidOpen}
          } else {
            ${iosMraidOpen}
          }
        } else if (target) {
          window.open(target, '_blank');
        }
      },
      game_ready: function () {
        super_log('game ready');
        if (window.mraid && window.mraid.getState && window.mraid.getState() === 'loading') {
          window.mraid.addEventListener('ready', super_boot_engine);
        } else {
          super_boot_engine();
        }
      }
    };
  `;
}

export const ADAPTERS: Record<Exclude<NetworkId, 'default'> | 'common', NetworkAdapter> = {
  common: {
    id: 'default',
    label: 'Default',
    script: `
      window.nameplatform = 'default';
      window.super_html = {
        download: function (url) { if (url) window.open(url, '_blank'); },
        game_ready: function () { super_boot_engine(); }
      };
    `,
  },
  applovin: {
    id: 'applovin',
    label: 'AppLovin',
    headHtml: MRAID_HEAD,
    mraid: 'standard',
    script: `
      window.nameplatform = 'applovin';
      var cgbAppLovinPrevious = window.super_html || {};
      window.super_html = {
        google_play_url: cgbAppLovinPrevious.google_play_url,
        appstore_url: cgbAppLovinPrevious.appstore_url,
        download: function (url) {
          super_log('game download');
          var target = url || (/android/i.test(navigator.userAgent || navigator.vendor)
            ? window.super_html.google_play_url
            : window.super_html.appstore_url);
          if (!target) {
            console.error('[CGB Studio packer] AppLovin store URL is not configured.');
            return;
          }
          if (window.mraid && typeof window.mraid.open === 'function') {
            window.mraid.open(target);
          } else {
            window.open(target, '_blank');
          }
        },
        game_ready: function () {
          super_log('game ready');
          super_check_channel(window.mraid);
          super_boot_engine();
        }
      };
    `,
  },
  ironsource: {
    id: 'ironsource',
    label: 'IronSource MRAID',
    headHtml: MRAID_HEAD,
    mraid: 'standard',
    script: createMraidAdapterScript('ironsource', 'IronSource MRAID'),
  },
  mraid_universal: {
    id: 'mraid_universal',
    label: 'MRAID Universal',
    headHtml: MRAID_HEAD,
    mraid: 'standard',
    script: createMraidAdapterScript('mraid-universal', 'MRAID Universal'),
  },
  ironsource_dapi: {
    id: 'ironsource_dapi',
    label: 'IronSource DAPI',
    headHtml: dapiBootstrap,
    script: `
      window.nameplatform = 'ironsource';
      var cgbDapiGameReady = false;
      var cgbDapiViewable = false;
      var cgbDapiStarted = false;
      function cgbDapiTryStart() {
        if (cgbDapiGameReady && cgbDapiViewable && !cgbDapiStarted) {
          cgbDapiStarted = true;
          super_boot_engine();
        }
      }
      function cgbDapiViewableChange(event) {
        cgbDapiViewable = Boolean(event && event.isViewable);
        if (cgbDapiViewable) cgbDapiTryStart();
      }
      function cgbDapiAudioChange(volume) {
        if (window.super_html_change_audio) {
          window.super_html_change_audio(Boolean(volume));
        }
      }
      function cgbDapiResize(event) {
        window.screenSize = event || (window.dapi.getScreenSize && window.dapi.getScreenSize());
      }
      function cgbDapiReady() {
        if (window.dapi.removeEventListener) {
          window.dapi.removeEventListener('ready', cgbDapiReady);
        }
        cgbDapiViewable = !window.dapi.isViewable || window.dapi.isViewable();
        window.dapi.addEventListener('viewableChange', cgbDapiViewableChange);
        window.dapi.addEventListener('adResized', cgbDapiResize);
        window.dapi.addEventListener('audioVolumeChange', cgbDapiAudioChange);
        cgbDapiResize();
        cgbDapiTryStart();
      }
      window.addEventListener('load', function () {
        super_check_channel(window.dapi);
        if (!window.dapi.isReady || window.dapi.isReady()) cgbDapiReady();
        else window.dapi.addEventListener('ready', cgbDapiReady);
      });
      window.super_html = {
        download: function () {
          super_log('game download');
          if (window.dapi.openStoreUrl) window.dapi.openStoreUrl();
        },
        game_ready: function () {
          super_log('game ready');
          cgbDapiGameReady = true;
          cgbDapiTryStart();
        },
        game_end: function () { if (window.gameEnd) window.gameEnd(); },
        is_audio: function () {
          return !window.dapi.getAudioVolume || Boolean(window.dapi.getAudioVolume());
        }
      };
    `,
  },
  mintegral: {
    id: 'mintegral',
    label: 'Mintegral',
    script: `
      window.nameplatform = 'mintegral';
      var cgbMintegralStarted = false;
      function gameStart() {
        if (cgbMintegralStarted) return;
        cgbMintegralStarted = true;
        super_boot_engine();
      }
      function gameClose() {
        super_log('game close');
      }
      window.gameStart = gameStart;
      window.gameClose = gameClose;
      window.super_html = {
        download: function () {
          super_log('game download');
          if (window.install) window.install();
        },
        game_ready: function () {
          super_log('game ready');
          if (window.gameReady) window.gameReady();
          window.gameStart();
        },
        game_end: function () {
          if (window.gameEnd) window.gameEnd();
        }
      };
    `,
  },
  unity: {
    id: 'unity',
    label: 'Unity',
    headHtml: MRAID_HEAD,
    mraid: 'standard',
    // packer.ts replaces this placeholder with a post-obfuscation script that
    // contains the detected store URLs as validator-visible literals.
    script: '',
  },
  google: {
    id: 'google',
    label: 'Google',
    headHtml: `<script type="text/javascript" src="${GOOGLE_EXIT_API_URL}"></script>`,
    script: `
      window.nameplatform = 'google';
      window.super_html = {
        download: function () {
          super_log('game download');
          ExitApi.exit();
        },
        game_ready: function () {
          super_log('game ready');
          super_boot_engine();
        },
        is_hide_download: function () { return true; }
      };
    `,
  },
  facebook: {
    id: 'facebook',
    label: 'Facebook',
    script: `
      window.nameplatform = 'facebook';
      try { navigator.getGamepads = null; } catch (error) {}
      window.super_html = {
        download: function () {
          super_log('game download');
          if (window.FbPlayableAd) window.FbPlayableAd.onCTAClick();
        },
        game_ready: function () {
          super_check_channel(window.FbPlayableAd);
          super_boot_engine();
        }
      };
    `,
  },
  pangle: {
    id: 'pangle',
    label: 'Pangle',
    headHtml: '<script src="https://sf16-muse-va.ibytedtos.com/obj/union-fe-nc-i18n/playable/sdk/playable-sdk.js"></script>',
    script: `
      window.nameplatform = 'pangle';
      window.super_html = {
        download: function () {
          super_log('game download');
          if (window.openAppStore) window.openAppStore();
        },
        game_ready: function () {
          super_check_channel(window.openAppStore);
          super_boot_engine();
        }
      };
    `,
  },
  liftoff: {
    id: 'liftoff',
    label: 'Liftoff',
    headHtml: MRAID_HEAD,
    mraid: 'standard',
    script: `window.buttonsoundoff = 1; window.nameplatform = 'liftoff';${mraidDownload}`,
  },
  moloco: {
    id: 'moloco',
    label: 'Moloco',
    script: `
      window.nameplatform = 'moloco';
      window.super_html = {
        download: function () {
          if (window.FbPlayableAd) window.FbPlayableAd.onCTAClick();
        },
        game_ready: function () {
          super_check_channel(window.FbPlayableAd);
          super_boot_engine();
        }
      };
    `,
  },
  tiktok: {
    id: 'tiktok',
    label: 'TikTok',
    script: `
      window.nameplatform = 'tiktok';
      window.super_html = {
        download: function () { if (window.openAppStore) window.openAppStore(); },
        game_ready: function () { super_check_channel(window.openAppStore); super_boot_engine(); }
      };
    `,
  },
  vungle: {
    id: 'vungle',
    label: 'Vungle',
    script: `
      window.nameplatform = 'vungle';
      window.super_html = {
        download: function () { parent.postMessage('download', '*'); },
        game_ready: function () { super_boot_engine(); },
        game_end: function () { parent.postMessage('complete', '*'); }
      };
    `,
  },
  bigo: {
    id: 'bigo',
    label: 'Bigo',
    headHtml: '<script src="https://static-web.likeevideo.com/as/common-static/big-data/dsp-public/bgy-mraid-sdk.js"></script>',
    mraid: 'bigo',
    script: `
      window.nameplatform = 'bigo';
      window.super_html = {
        download: function () { if (window.BGY_MRAID) window.BGY_MRAID.open(); },
        game_ready: function () {
          super_boot_engine();
          if (window.BGY_MRAID && window.BGY_MRAID.gameReady) window.BGY_MRAID.gameReady();
        },
        game_end: function () {
          if (window.BGY_MRAID && window.BGY_MRAID.gameEnd) window.BGY_MRAID.gameEnd();
        }
      };
    `,
  },
  kwai: {
    id: 'kwai',
    label: 'Kwai',
    headHtml: '<script src="https://s1.kwai.net/kos/s101/nlav11187/playable/kwai-playable-sdk.js"></script>',
    script: `
      window.nameplatform = 'kwai';
      if (window.ks_playable_exposurePage) window.ks_playable_exposurePage();
      window.super_html = {
        download: function () { if (window.ks_playable_openAppStore) window.ks_playable_openAppStore(); },
        game_ready: function () {
          if (window.ks_playable_startPlay) window.ks_playable_startPlay();
          super_boot_engine();
        }
      };
    `,
  },
  snapchat: {
    id: 'snapchat',
    label: 'Snapchat',
    headHtml: '<script src="mraid.js"></script>',
    mraid: 'standard',
    script: `
      window.nameplatform = 'snapchat';
      window.snapchatCta = function snapchatCta() {
        super_log('Snapchat CTA clicked');
        if (window.mraid && typeof window.mraid.open === 'function') {
          window.mraid.open('{{ .ClickTrackingUrl }}');
        }
      };
      window.super_html = {
        download: function () { window.snapchatCta(); },
        game_ready: function () {
          super_boot_engine();
        }
      };
    `,
  },
  adcolony: {
    id: 'adcolony',
    label: 'AdColony (legacy)',
    headHtml: MRAID_HEAD,
    mraid: 'standard',
    script: `
      window.nameplatform = 'adcolony';
      var cgbAdColonyPrevious = window.super_html || {};
      window.super_html = {
        google_play_url: cgbAdColonyPrevious.google_play_url,
        appstore_url: cgbAdColonyPrevious.appstore_url,
        download: function (url) {
          var target = url || (/android/i.test(navigator.userAgent || navigator.vendor)
            ? window.super_html.google_play_url
            : window.super_html.appstore_url);
          if (window.mraid && typeof window.mraid.open === 'function') {
            if (target) window.mraid.open(target);
            else window.mraid.open();
          } else if (target) {
            window.open(target, '_blank');
          }
        },
        game_ready: function () {
          super_boot_engine();
        }
      };
    `,
  },
};
