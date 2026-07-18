import test from 'node:test';
import assert from 'node:assert/strict';
import { botDelayMs } from '../src/lib/bot-timing.js';

test('sorteia cerca de dois segundos para toda decisão do bot', () => {
  assert.equal(
    botDelayMs(() => 0),
    1_800,
  );
  assert.equal(
    botDelayMs(() => 0.999999),
    2_400,
  );
});
