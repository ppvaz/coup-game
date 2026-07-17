import test from 'node:test';
import assert from 'node:assert/strict';
import { trackPresence } from '../src/lib/realtime.js';

test('confirma o registro da presença quando o canal responde', async () => {
  const calls = [];
  const channel = {
    track: async (payload) => {
      calls.push(payload);
      return 'ok';
    },
  };

  assert.equal(await trackPresence(channel, { playerId: 'a' }, 20), 'ok');
  assert.deepEqual(calls, [{ playerId: 'a' }]);
});

test('não deixa a conexão presa quando a confirmação da presença não chega', async () => {
  const channel = { track: () => new Promise(() => {}) };
  assert.equal(await trackPresence(channel, { playerId: 'a' }, 5), 'pending');
});

test('distingue uma falha explícita de uma confirmação atrasada', async () => {
  assert.equal(await trackPresence({ track: async () => 'timed out' }, {}, 20), 'error');
  assert.equal(await trackPresence({ track: async () => Promise.reject(new Error('offline')) }, {}, 20), 'error');
});
