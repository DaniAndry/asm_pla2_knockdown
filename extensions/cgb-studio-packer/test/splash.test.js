'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  applySplashOverride,
  baseSplashSettings,
  copySplashAsset,
  resolveStoredSplashFile,
} = require('../dist/splash');
const { createDefaultSplashOverride } = require('../dist/settings');

test('Splash assets are copied into the project and source files remain unchanged', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-splash-project-'));
  const sourceDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-splash-source-'));
  const source = path.join(sourceDirectory, 'logo.png');
  const original = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  fs.writeFileSync(source, original);

  const stored = copySplashAsset(project, 'variant-1', 'logo', source);
  assert.equal(
    stored,
    'settings/cgb-studio-packer-assets/splash/variant-1/logo.png',
  );
  assert.deepEqual(fs.readFileSync(source), original);
  assert.deepEqual(fs.readFileSync(resolveStoredSplashFile(project, stored)), original);
});

test('Splash override changes only logo, background and scale', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-splash-merge-'));
  const inherited = baseSplashSettings({
    displayRatio: 0.7,
    totalTime: 4321,
    autoFit: false,
    watermarkLocation: 'bottomRight',
    logo: { type: 'default' },
    background: { type: 'default' },
  });
  const override = createDefaultSplashOverride();
  override.mode = 'override';
  override.displayRatio = 1.75;
  override.logo.type = 'none';
  override.background.type = 'color';
  override.background.color = { x: 1, y: 0.5, z: 0.25, w: 1 };

  const result = applySplashOverride(project, inherited, override);
  assert.equal(result.displayRatio, 1.75);
  assert.equal(result.totalTime, 4321);
  assert.equal(result.autoFit, false);
  assert.equal(result.watermarkLocation, 'bottomRight');
  assert.deepEqual(result.logo, { type: 'none' });
  assert.deepEqual(result.background, {
    type: 'color',
    color: { x: 1, y: 0.5, z: 0.25, w: 1 },
  });
});

test('Splash rejects unsupported and oversized files', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'cgb-splash-invalid-'));
  const text = path.join(project, 'logo.gif');
  fs.writeFileSync(text, 'not an image');
  assert.throws(
    () => copySplashAsset(project, 'variant-1', 'logo', text),
    /PNG, JPG or JPEG/,
  );

  const large = path.join(project, 'large.jpg');
  fs.writeFileSync(large, Buffer.alloc(5 * 1024 * 1024 + 1));
  assert.throws(
    () => copySplashAsset(project, 'variant-1', 'background', large),
    /no larger than 5 MB/,
  );
});
