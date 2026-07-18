import test from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_MAX_AGE_MS, clearOnlineSession, loadOnlineSession, saveOnlineSession } from '../src/rooms/session.js';

const makeStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};

test('restaura a cadeira da mesma sala durante a sessão da aba', () => {
  const storage = makeStorage();
  const snapshot = {
    code: 'ABCDE',
    myId: 'player-a',
    name: 'Ana',
    room: { code: 'ABCDE', hostId: 'player-a' },
    game: { version: 3 },
  };
  saveOnlineSession(storage, snapshot, 1_000);
  assert.deepEqual(loadOnlineSession(storage, 'ABCDE', 2_000), { ...snapshot, savedAt: 1_000 });
});

test('ignora sessão expirada ou pertencente a outro convite', () => {
  const storage = makeStorage();
  saveOnlineSession(storage, { code: 'ABCDE', myId: 'a', name: 'Ana', room: { code: 'ABCDE' } }, 1_000);
  assert.equal(loadOnlineSession(storage, 'FGHJK', 2_000), null);
  assert.equal(loadOnlineSession(storage, 'ABCDE', 1_000 + SESSION_MAX_AGE_MS + 1), null);
  clearOnlineSession(storage);
  assert.equal(loadOnlineSession(storage, 'ABCDE', 2_000), null);
});

test('migra a embaixadora em partidas salvas com o nome antigo', () => {
  const storage = makeStorage();
  const snapshot = {
    code: 'ABCDE',
    myId: 'a',
    name: 'Ana',
    room: { code: 'ABCDE' },
    game: {
      players: [{ id: 'a', cards: [{ id: 'a-Embaixador-0', role: 'Embaixador', revealed: false }] }],
      deck: [{ id: 'Embaixador-1', role: 'Embaixador', revealed: false }],
      exchangeOptions: [],
      pending: { claimedRole: 'Embaixador', block: { role: 'Embaixador' } },
      log: [{ type: 'block_declared', role: 'Embaixador' }],
    },
  };

  saveOnlineSession(storage, snapshot, 1_000);
  const restored = loadOnlineSession(storage, 'ABCDE', 2_000);

  assert.equal(restored.game.players[0].cards[0].id, 'a-Embaixadora-0');
  assert.equal(restored.game.players[0].cards[0].role, 'Embaixadora');
  assert.equal(restored.game.deck[0].role, 'Embaixadora');
  assert.equal(restored.game.pending.claimedRole, 'Embaixadora');
  assert.equal(restored.game.pending.block.role, 'Embaixadora');
  assert.equal(restored.game.log[0].role, 'Embaixadora');
});
