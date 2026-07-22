import assert from 'node:assert/strict';
import test from 'node:test';
import { localBotSeats, normalizeLocalBotCount } from '../src/game/local-bots.js';

test('monta partidas locais de um a cinco bots', () => {
  assert.deepEqual(localBotSeats('Ana', 1), [
    { id: 'me', name: 'Ana', kind: 'human' },
    { id: 'bot-0', name: 'Lorenzo', kind: 'bot' },
  ]);
  const full = localBotSeats('Ana', 5);
  assert.equal(full.length, 6);
  assert.equal(full.at(-1).name, 'Catarina');
});

test('normaliza quantidade adulterada para os limites da mesa', () => {
  assert.equal(normalizeLocalBotCount(undefined), 3);
  assert.equal(normalizeLocalBotCount('5'), 5);
  assert.equal(normalizeLocalBotCount(-20), 1);
  assert.equal(normalizeLocalBotCount(99), 5);
});
