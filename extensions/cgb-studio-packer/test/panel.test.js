'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const { EXTENSION_VERSION } = require('../dist/builder-tasks');
const { createDefaultSettings } = require('../dist/settings');
const { NETWORK_IDS } = require('../dist/types');

test('extension manifest does not restore the floating panel and registers project helpers', () => {
  const manifest = require('../package.json');
  assert.equal(manifest.panels.default.flags.save, false);
  assert.deepEqual(
    manifest.contributions.messages['open-developer-overrides'].methods,
    ['openDeveloperOverrides'],
  );
  assert.equal(manifest.contributions['open-developer-overrides'], undefined);
  assert.deepEqual(
    manifest.contributions.messages['install-ads-manager'].methods,
    ['installAdsManager'],
  );
});

function panelContext(document, selectors) {
  return {
    $: Object.fromEntries(
      Object.entries(selectors).map(([key, selector]) => [key, document.querySelector(selector)]),
    ),
  };
}

async function waitForMessage(messages, expected, timeoutMs = 1500) {
  const timeout = Date.now() + timeoutMs;
  while (!messages.some(([target, message]) => `${target}:${message}` === expected)
    && Date.now() < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(
    messages.some(([target, message]) => `${target}:${message}` === expected),
    `${expected} message was sent`,
  );
}

test('panel renders variations, size estimate, current options, networks and actions', async () => {
  const previousEditor = global.Editor;
  const panelModule = require('../dist/panel/index.js');
  const dom = new JSDOM(panelModule.template);
  const document = dom.window.document;
  let copiedError = '';
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    configurable: true,
    value: {
      async writeText(value) { copiedError = value; },
    },
  });
  const settings = createDefaultSettings();
  settings.assetEncoding = 'base122';
  settings.buildDefaults.name = 'fixture';
  settings.buildDefaults.engineModulesConfigKey = 'default';
  settings.variants[0].name = 'Main';
  settings.variants[0].scenes = [
    { name: 'Main', url: 'db://assets/Main.scene', uuid: 'scene-1' },
  ];
  settings.variants[0].startScene = 'scene-1';
  settings.variants[0].sizeEstimate = {
    calculatedAt: '2026-07-31T10:00:00.000Z',
    fingerprint: 'fixture-fingerprint',
    sourceOutput: 'build/cgb-size-estimate/Main/web-mobile',
    base64Bytes: (5120 * 1024) + 1,
    base122Bytes: 5120 * 1024,
    categories: [{
      id: 'textures',
      label: 'Textures',
      rawBytes: 400 * 1024,
      compressedBytes: 300 * 1024,
      base64Bytes: 400 * 1024,
      base122Bytes: 450 * 1024,
    }],
  };
  const messages = [];
  const emptyQueue = {
    running: false,
    currentIndex: -1,
    total: 0,
    items: [],
  };

  global.Editor = {
    Message: {
      async request(packageName, message, ...args) {
        messages.push([packageName, message, args]);
        if (message === 'get-state') {
          return {
            version: EXTENSION_VERSION,
            settings,
            buildTasks: [],
            projectScenes: [
              { name: 'Main', url: 'db://assets/Main.scene', uuid: 'scene-1' },
              { name: 'Alternative', url: 'db://assets/Alternative.scene', uuid: 'scene-2' },
            ],
            engineModuleConfigs: [{ key: 'default', label: 'Default' }],
            outputDirectory: 'C:/fixture/build/cgb-playable-ready',
            lastError: 'Fixture backend error',
            busy: false,
            queue: emptyQueue,
            splashPreviews: {},
            estimateState: { running: false },
            estimateStale: { [settings.variants[0].id]: false },
            previewAvailable: true,
            adsManager: {
              path: 'C:/fixture/assets/Scripts/CGB/AdsManager.ts',
              installed: false,
            },
          };
        }
        if (message === 'save-settings') return JSON.parse(JSON.stringify(args[0]));
        if (message === 'build') {
          return {
            outputDirectory: 'C:/fixture/build/cgb-playable-ready',
            queue: {
              running: false,
              currentIndex: 0,
              total: 1,
              items: [{
                variantId: settings.variants[0].id,
                name: 'Main',
                status: 'success',
              }],
            },
          };
        }
        if (message === 'pack-existing') {
          return { outputDirectory: 'C:/fixture/build/cgb-playable-ready/Main' };
        }
        if (message === 'estimate-size') {
          return {
            outputDirectory: 'C:/fixture/build/cgb-size-estimate/Main/web-mobile',
            estimate: settings.variants[0].sizeEstimate,
          };
        }
        if (message === 'install-ads-manager') {
          return {
            path: 'C:/fixture/assets/Scripts/CGB/AdsManager.ts',
            installed: true,
            created: true,
          };
        }
        return undefined;
      },
    },
  };

  try {
    const context = panelContext(document, panelModule.$);
    await panelModule.ready.call(context);

    assert.equal(document.querySelector('.error-panel').style.display, 'block');
    assert.equal(document.querySelector('.error').textContent, 'Fixture backend error');
    document.querySelector('.copy-error').click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(copiedError, 'Fixture backend error');
    assert.equal(document.querySelector('.copy-error').textContent, 'Copied');

    assert.equal(document.querySelectorAll('.variant-item').length, 1);
    assert.ok(document.querySelectorAll('.required').length >= 8);
    assert.ok(document.querySelector('.networks').compareDocumentPosition(
      document.querySelector('.snapchat-advanced'),
    ) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
    assert.match(document.querySelector('.ads-manager-path').textContent, /Not installed/);
    document.querySelector('.install-ads-manager').click();
    await waitForMessage(messages, 'cgb-studio-packer:install-ads-manager');
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.match(document.querySelector('.ads-manager-path').textContent, /Installed:/);
    assert.equal(document.querySelectorAll('.scenes input').length, 2);
    assert.equal(document.querySelector('.game-name').value, 'fixture');
    assert.equal(document.querySelector('.native-mode').value, 'asmjs');
    assert.equal(document.querySelector('.engine-config').value, 'default');
    assert.equal(document.querySelector('.target-subfolders').checked, true);
    assert.equal(document.querySelector('.snapchat-advanced').style.display, 'block');
    assert.equal(
      document.querySelector('.snapchat-folder').value,
      settings.variants[0].snapchat.cdnFolder,
    );
    assert.equal(document.querySelector('.snapchat-config').value, '{}');
    assert.equal(document.querySelector('.estimate-summary').classList.contains('visible'), true);
    assert.equal(document.querySelector('.estimate-base64').classList.contains('over-limit'), true);
    assert.equal(document.querySelector('.estimate-base122').classList.contains('over-limit'), false);
    assert.match(document.querySelector('.estimate-base64 small').textContent, /Exceeds 5 MB by 1 KB/);
    assert.equal(document.querySelectorAll('.estimate-table .estimate-cell').length, 10);
    for (const removed of [
      '.debug',
      '.source-maps',
      '.mangle-properties',
      '.md5-cache',
      '.skip-compress-texture',
      '.use-webgpu',
    ]) {
      assert.equal(document.querySelector(removed), null);
    }

    let sceneInputs = Array.from(document.querySelectorAll('.scenes input'));
    sceneInputs[1].checked = true;
    sceneInputs[1].dispatchEvent(new dom.window.Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    sceneInputs = Array.from(document.querySelectorAll('.scenes input'));
    sceneInputs[0].checked = false;
    sceneInputs[0].dispatchEvent(new dom.window.Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    sceneInputs = Array.from(document.querySelectorAll('.scenes input'));
    assert.deepEqual(sceneInputs.map((input) => input.checked), [false, true]);
    assert.deepEqual(
      Array.from(document.querySelector('.start-scene').options).map((option) => option.value),
      ['scene-2'],
    );
    assert.equal(document.querySelector('.start-scene').value, 'scene-2');

    const networkInputs = Array.from(document.querySelectorAll('input[data-network]'));
    assert.equal(networkInputs.length, NETWORK_IDS.length);
    assert.deepEqual(
      networkInputs.map((input) => input.getAttribute('data-network')),
      NETWORK_IDS,
    );
    assert.ok(networkInputs.every((input) => input.checked));

    for (const [selector, expected] of [
      ['.build-selected', 'cgb-studio-packer:build'],
      ['.build-current', 'cgb-studio-packer:build'],
      ['.estimate-size', 'cgb-studio-packer:estimate-size'],
      ['.pack-existing', 'cgb-studio-packer:pack-existing'],
      ['.preview', 'cgb-studio-packer:preview'],
      ['.open-output', 'cgb-studio-packer:open-output'],
      ['.open-build-settings', 'builder:open'],
    ]) {
      document.querySelector(selector).click();
      await waitForMessage(messages, expected);
      while (document.querySelector(selector).disabled) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    document.querySelector('.version').dispatchEvent(new dom.window.MouseEvent('dblclick'));
    await waitForMessage(messages, 'cgb-studio-packer:open-developer-overrides');
    while (document.querySelector('.add-variant').disabled) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    document.querySelector('.add-variant').click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(document.querySelectorAll('.variant-item').length, 2);
    assert.deepEqual(
      Array.from(document.querySelectorAll('.variant-label')).map((item) => item.textContent),
      ['Main', 'Main 2'],
    );

    const sourceSnapFolder = document.querySelector('.snapchat-folder').value;
    document.querySelector('.duplicate-variant').click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(document.querySelectorAll('.variant-item').length, 3);
    assert.notEqual(document.querySelector('.snapchat-folder').value, sourceSnapFolder);
    assert.equal(document.querySelector('.snapchat-config').value, '{}');

    document.querySelector('.target-subfolders').checked = false;
    document.querySelector('.target-subfolders').dispatchEvent(new dom.window.Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 10));
    const lastSavedSettings = messages
      .filter(([, message]) => message === 'save-settings')
      .at(-1)[2][0];
    assert.equal(lastSavedSettings.createTargetSubfolders, false);

    document.querySelector('.clear-all').click();
    await waitForMessage(messages, 'cgb-studio-packer:save-settings');
    assert.ok(
      Array.from(document.querySelectorAll('input[data-network]'))
        .every((input) => !input.checked),
    );
    assert.equal(document.querySelector('.snapchat-advanced').style.display, 'none');

    document.querySelector('.select-all').click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(
      Array.from(document.querySelectorAll('input[data-network]'))
        .every((input) => input.checked),
    );
    assert.equal(document.querySelector('.snapchat-advanced').style.display, 'block');
    assert.equal(document.querySelector('.error').style.display, 'none');
  } finally {
    global.Editor = previousEditor;
    dom.window.close();
  }
});

test('5 MB warning uses the exact byte boundary', () => {
  const { SIZE_LIMIT_BYTES, sizeLimitExceeded } = require('../dist/panel/index.js');
  assert.equal(SIZE_LIMIT_BYTES, 5120 * 1024);
  assert.equal(sizeLimitExceeded(SIZE_LIMIT_BYTES), false);
  assert.equal(sizeLimitExceeded(SIZE_LIMIT_BYTES + 1), true);
});
