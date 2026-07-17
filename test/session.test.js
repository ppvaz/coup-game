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
