'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { onAfterBuild } = require('../dist/hooks');

test('estimateOnly completely skips normal onAfterBuild packing', async () => {
  await assert.doesNotReject(() => onAfterBuild({
    platform: 'web-mobile',
    packages: {
      'cgb-studio-packer': {
        estimateOnly: true,
      },
    },
  }, {}));
});
