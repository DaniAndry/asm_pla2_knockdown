'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const { ADAPTERS } = require('../dist/networks/adapters');
const { createMraidLifecycleScript } = require('../dist/networks/mraid-lifecycle');

function browser() {
  return new JSDOM('<!doctype html><html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'https://preview.invalid/',
  });
}

test('shared standard MRAID lifecycle waits for ready and viewability and starts once', () => {
  const dom = browser();
  const events = {};
  let state = 'loading';
  let visible = false;
  let starts = 0;
  const audio = [];
  let resizeEvents = 0;
  dom.window.__cgbStart = () => { starts += 1; };
  dom.window.super_html_change_audio = (enabled) => { audio.push(enabled); };
  dom.window.addEventListener('resize', () => { resizeEvents += 1; });
  dom.window.mraid = {
    getState: () => state,
    isViewable: () => visible,
    addEventListener(name, callback) { events[name] = callback; },
  };

  dom.window.eval(createMraidLifecycleScript('standard'));
  assert.equal(starts, 0);
  assert.equal(typeof events.ready, 'function');
  state = 'default';
  events.ready();
  assert.equal(starts, 0);
  for (const name of ['viewableChange', 'exposureChange', 'sizeChange', 'audioVolumeChange']) {
    assert.equal(typeof events[name], 'function', `${name} is registered`);
  }

  visible = true;
  events.viewableChange(true);
  events.viewableChange(true);
  assert.equal(starts, 1);
  events.viewableChange(false);
  assert.equal(audio.at(-1), false);
  events.exposureChange(100);
  assert.equal(starts, 1);
  events.audioVolumeChange(50);
  assert.equal(audio.at(-1), true);
  events.sizeChange(320, 480);
  assert.equal(dom.window.screenSize.width, 320);
  assert.equal(dom.window.screenSize.height, 480);
  assert.ok(resizeEvents > 0);
  dom.window.dispatchEvent(new dom.window.Event('orientationchange'));
  assert.ok(resizeEvents > 1);
  dom.window.close();
});

test('shared lifecycle starts immediately only when its provider is absent', () => {
  for (const provider of ['standard', 'bigo']) {
    const dom = browser();
    let starts = 0;
    dom.window.__cgbStart = () => { starts += 1; };
    dom.window.eval(createMraidLifecycleScript(provider));
    assert.equal(starts, 1, provider);
    dom.window.close();
  }
});

test('Bigo lifecycle supports a minimal BGY_MRAID implementation', () => {
  const dom = browser();
  let starts = 0;
  dom.window.__cgbStart = () => { starts += 1; };
  dom.window.BGY_MRAID = { open() {} };
  dom.window.eval(createMraidLifecycleScript('bigo'));
  assert.equal(starts, 1);
  dom.window.close();
});

test('only approved targets use the shared MRAID controller', () => {
  const standard = ['applovin', 'ironsource', 'mraid_universal', 'unity', 'liftoff', 'snapchat', 'adcolony'];
  for (const id of standard) {
    assert.equal(ADAPTERS[id].mraid, 'standard', id);
    assert.match(ADAPTERS[id].headHtml, /<script src="mraid\.js"><\/script>/, id);
  }
  assert.equal(ADAPTERS.bigo.mraid, 'bigo');
  for (const id of [
    'common', 'ironsource_dapi', 'mintegral', 'google', 'facebook', 'pangle',
    'moloco', 'tiktok', 'vungle', 'kwai',
  ]) {
    assert.equal(ADAPTERS[id].mraid, undefined, id);
  }
});

test('Mintegral exposes validator-visible gameStart and gameClose callbacks', () => {
  const dom = browser();
  let starts = 0;
  let ready = 0;
  let ended = 0;
  dom.window.super_log = () => {};
  dom.window.super_boot_engine = () => { starts += 1; };
  dom.window.gameReady = () => { ready += 1; };
  dom.window.gameEnd = () => { ended += 1; };
  dom.window.eval(ADAPTERS.mintegral.script);
  assert.equal(typeof dom.window.gameStart, 'function');
  assert.equal(typeof dom.window.gameClose, 'function');
  dom.window.super_html.game_ready();
  dom.window.gameStart();
  dom.window.gameClose();
  dom.window.super_html.game_end();
  assert.equal(ready, 1);
  assert.equal(starts, 1);
  assert.equal(ended, 1);
  dom.window.close();
});
