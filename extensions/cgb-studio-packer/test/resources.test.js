'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { isProjectScript, ResourceCollector } = require('../dist/packer/resources');

test('only compiled project bundles are eligible for obfuscation', () => {
  assert.equal(isProjectScript('assets/main/index.js'), true);
  assert.equal(isProjectScript('assets/custom-bundle/index.js'), true);
  assert.equal(isProjectScript('src/chunks/bundle.js'), true);
  assert.equal(isProjectScript('src/system.bundle.js'), false);
  assert.equal(isProjectScript('src/polyfills.bundle.js'), false);
  assert.equal(isProjectScript('index.js'), false);
  assert.equal(isProjectScript('application.js'), false);
  assert.equal(isProjectScript('assets/internal/index.js'), false);
  assert.equal(isProjectScript('cocos-js/cc.js'), false);
});

test('obfuscation leaves the Cocos bootstrap and inline System.import intact', () => {
  const input = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-resources-'));
  fs.mkdirSync(path.join(input, 'src'), { recursive: true });
  fs.mkdirSync(path.join(input, 'assets', 'main'), { recursive: true });
  const system = 'window.System={import:function(value){return value;}};';
  const project = 'window.projectValue = "project-secret";';
  fs.writeFileSync(path.join(input, 'src', 'system.bundle.js'), system);
  fs.writeFileSync(path.join(input, 'assets', 'main', 'index.js'), project);

  const collector = new ResourceCollector(input, true);
  collector.collect();
  assert.equal(collector.getText('src/system.bundle.js'), system);
  assert.notEqual(collector.getText('assets/main/index.js'), project);
  assert.equal(
    collector.processInlineScript("System.import('./index.js')"),
    "System.import('./index.js')",
  );
});

test('separately obfuscated bundles use non-colliding global helpers', () => {
  const input = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-obfuscation-prefix-'));
  fs.mkdirSync(path.join(input, 'assets', 'main'), { recursive: true });
  fs.mkdirSync(path.join(input, 'src', 'chunks'), { recursive: true });
  fs.writeFileSync(
    path.join(input, 'assets', 'main', 'index.js'),
    'globalThis.__cgbFirst = Object.keys({first: true})[0];',
  );
  fs.writeFileSync(
    path.join(input, 'src', 'chunks', 'bundle.js'),
    'globalThis.__cgbSecond = Object.keys({second: true})[0];',
  );

  const collector = new ResourceCollector(input, true);
  collector.collect();
  const first = collector.getText('assets/main/index.js');
  const second = collector.getText('src/chunks/bundle.js');
  assert.match(first, /cgb_[a-f0-9]{10}_/);
  assert.match(second, /cgb_[a-f0-9]{10}_/);
  assert.notEqual(
    first.match(/cgb_[a-f0-9]{10}_/)[0],
    second.match(/cgb_[a-f0-9]{10}_/)[0],
  );

  Function(`${first}\n${second}`)();
  assert.equal(globalThis.__cgbFirst, 'first');
  assert.equal(globalThis.__cgbSecond, 'second');
  delete globalThis.__cgbFirst;
  delete globalThis.__cgbSecond;
});

test('store URLs are detected before project bundle obfuscation', () => {
  const input = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-store-urls-'));
  fs.mkdirSync(path.join(input, 'assets', 'main'), { recursive: true });
  fs.writeFileSync(path.join(input, 'assets', 'main', 'index.js'), `
    api.set_google_play_url("https://play.google.com/store/apps/details?id=com.fixture.game");
    api.set_app_store_url("https://apps.apple.com/us/app/fixture/id1234567890");
  `);
  const collector = new ResourceCollector(input, true);
  collector.collect();
  assert.deepEqual(collector.getDetectedStoreUrls(), {
    googlePlayUrl: 'https://play.google.com/store/apps/details?id=com.fixture.game',
    appStoreUrl: 'https://apps.apple.com/us/app/fixture/id1234567890',
  });
  assert.notEqual(
    collector.getText('assets/main/index.js'),
    fs.readFileSync(path.join(input, 'assets', 'main', 'index.js'), 'utf8'),
  );
});

test('store URLs are scoped to the component type used by the start scene', () => {
  const input = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-scoped-store-urls-'));
  fs.mkdirSync(path.join(input, 'assets', 'main'), { recursive: true });
  fs.writeFileSync(path.join(input, 'assets', 'main', 'index.js'), `
    System.register("NodeHTML_RU.ts", [], function () { return { execute: function () {
      cclegacy._RF.push({}, "ruType", "NodeHTML_RU", void 0);
      return "https://play.google.com/store/apps/details?id=com.fixture.ru";
    } }; });
    System.register("NodeHTML.ts", [], function () { return { execute: function () {
      cclegacy._RF.push({}, "enType", "NodeHTML", void 0);
      return "https://play.google.com/store/apps/details?id=com.fixture.en"
        + "https://apps.apple.com/app/fixture/id1234567890";
    } }; });
  `);
  const collector = new ResourceCollector(input, true);
  collector.collect();
  assert.deepEqual(collector.getDetectedStoreUrls(['enType']), {
    googlePlayUrl: 'https://play.google.com/store/apps/details?id=com.fixture.en',
    appStoreUrl: 'https://apps.apple.com/app/fixture/id1234567890',
  });
  assert.deepEqual(collector.getDetectedStoreUrls(['ruType']), {
    googlePlayUrl: 'https://play.google.com/store/apps/details?id=com.fixture.ru',
  });
});
