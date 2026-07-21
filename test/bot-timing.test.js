import test from 'node:test';
import assert from 'node:assert/strict';
import { botDelayMs } from '../src/lib/bot-timing.js';

test('dá tempo para acompanhar cada decisão do bot', () => {
  assert.equal(
    botDelayMs(() => 0),
    2_800,
  );
  assert.equal(
    botDelayMs(() => 0.999999),
    3_600,
  );
});
