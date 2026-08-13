'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { findPreviewHtml } = require('../dist/main');
const { OUTPUT_PROFILES } = require('../dist/networks/profiles');
const { createDefaultSettings } = require('../dist/settings');
const { NETWORK_IDS } = require('../dist/types');

test('Preview prefers Default then the newest enabled non-ZIP target', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-preview-'));
  const settings = createDefaultSettings();
  const variant = settings.variants[0];
  variant.name = 'Main';
  for (const id of NETWORK_IDS) settings.networks[id] = false;
  settings.networks.default = true;
  settings.networks.applovin = true;
  const variation = path.join(root, 'Main');
  fs.mkdirSync(path.join(variation, 'default'), { recursive: true });
  fs.mkdirSync(path.join(variation, 'applovin'), { recursive: true });
  const defaultFile = path.join(variation, 'default', 'Game%default.html');
  const appLovinFile = path.join(variation, 'applovin', 'Game%applovin.html');
  fs.writeFileSync(defaultFile, 'default');
  fs.writeFileSync(appLovinFile, 'applovin');
  const newer = new Date(Date.now() + 1000);
  fs.utimesSync(appLovinFile, newer, newer);
  assert.equal(findPreviewHtml(root, settings, variant, OUTPUT_PROFILES), defaultFile);

  settings.networks.default = false;
  assert.equal(findPreviewHtml(root, settings, variant, OUTPUT_PROFILES), appLovinFile);
  settings.networks.applovin = false;
  settings.networks.google = true;
  assert.equal(findPreviewHtml(root, settings, variant, OUTPUT_PROFILES), undefined);
});

test('Preview resolves Default in flat output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-preview-flat-'));
  const settings = createDefaultSettings();
  const variant = settings.variants[0];
  variant.name = 'Flat';
  settings.createTargetSubfolders = false;
  const variation = path.join(root, 'Flat');
  fs.mkdirSync(variation, { recursive: true });
  const file = path.join(variation, 'Game%default.html');
  fs.writeFileSync(file, 'default');
  assert.equal(findPreviewHtml(root, settings, variant, OUTPUT_PROFILES), file);
});
