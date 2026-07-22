import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKGROUND_STATE_SYNC_MS,
  STATE_SYNC_RETRY_MS,
  gameViewWithClock,
  needsBackgroundStateSync,
  needsGameViewSync,
  shouldAcceptGameView,
  shouldRequestStateSync,
  shouldResetGame,
} from '../src/rooms/game-sync.js';

test('revanche troca a partida mesmo quando a versão volta para um', () => {
  const finished = { gameId: 'old', version: 37, status: 'finished' };
  const rematch = { gameId: 'new', version: 1, status: 'playing' };

  assert.equal(shouldResetGame(finished, 'new'), true);
  assert.equal(shouldAcceptGameView(null, rematch, 'new'), true);
  assert.equal(shouldAcceptGameView(finished, rematch, 'new'), true);
});

test('sincronização rejeita visão atrasada da partida anterior', () => {
  const current = { gameId: 'new', version: 2, status: 'playing' };
  const delayed = { gameId: 'old', version: 38, status: 'finished' };

  assert.equal(shouldAcceptGameView(current, delayed, 'new'), false);
});

test('versões continuam ordenadas dentro da mesma partida', () => {
  const current = { gameId: 'same', version: 8 };

  assert.equal(shouldAcceptGameView(current, { gameId: 'same', version: 7 }, 'same'), false);
  assert.equal(shouldAcceptGameView(current, { gameId: 'same', version: 8 }, 'same'), true);
  assert.equal(shouldAcceptGameView(current, { gameId: 'same', version: 9 }, 'same'), true);
});

test('detecta visão ausente, revanche e encerramento perdido', () => {
  const playing = { activeGameId: 'new', status: 'playing' };
  const finished = { ...playing, status: 'finished' };

  assert.equal(needsGameViewSync({ activeGameId: null, status: 'lobby' }, null), false);
  assert.equal(needsGameViewSync(playing, null), true);
  assert.equal(needsGameViewSync(playing, { gameId: 'old', status: 'finished' }), true);
  assert.equal(needsGameViewSync(finished, { gameId: 'new', status: 'playing' }), true);
  assert.equal(needsGameViewSync(playing, { gameId: 'new', status: 'playing' }), false);
  assert.equal(needsGameViewSync(finished, { gameId: 'new', status: 'finished' }), false);
});

test('reconciliação de fundo não faz polling durante partida saudável', () => {
  assert.equal(needsBackgroundStateSync(null, null), false);
  assert.equal(needsBackgroundStateSync({ status: 'lobby' }, null), true);
  assert.equal(needsBackgroundStateSync({ status: 'finished' }, { status: 'finished' }), true);
  assert.equal(needsBackgroundStateSync({ status: 'playing' }, null), true);
  assert.equal(needsBackgroundStateSync({ status: 'playing' }, { status: 'finished' }), true);
  assert.equal(needsBackgroundStateSync({ status: 'playing' }, { status: 'playing' }), false);
});

test('visão final não carrega o relógio zerado como duração negativa', () => {
  const finished = gameViewWithClock(
    { status: 'finished', clockRemaining: -1_000_000, clockTotal: 0 },
    { deadline: 0, total: 0 },
    1_000_000,
  );
  assert.deepEqual(finished, { status: 'finished' });

  const playing = gameViewWithClock({ status: 'playing' }, { deadline: 900, total: 0 }, 1_000);
  assert.deepEqual(playing, { status: 'playing', clockRemaining: 0, clockTotal: 1 });
});

test('convidado pede o estado ao expirar e limita as tentativas', () => {
  const room = { status: 'playing' };
  const game = { status: 'playing' };
  const clock = { deadline: 10_000 };

  assert.equal(shouldRequestStateSync({ room, game, clock, now: 9_999 }), false);
  assert.equal(shouldRequestStateSync({ room, game, clock, now: 10_000 }), true);
  assert.equal(shouldRequestStateSync({ room, game, clock, lastRequestAt: 10_000, now: 10_001 }), false);
  assert.equal(
    shouldRequestStateSync({
      room,
      game,
      clock,
      lastRequestAt: 10_000,
      now: 10_000 + STATE_SYNC_RETRY_MS,
    }),
    true,
  );
  assert.equal(shouldRequestStateSync({ room: null, game, clock, now: 20_000, force: true }), false);
  assert.equal(shouldRequestStateSync({ room, game: null, clock: {}, now: 1, force: true }), true);
  assert.equal(
    shouldRequestStateSync({
      room,
      game: null,
      clock: {},
      lastRequestAt: 1,
      now: BACKGROUND_STATE_SYNC_MS,
      force: true,
      retryMs: BACKGROUND_STATE_SYNC_MS,
    }),
    false,
  );
  assert.equal(
    shouldRequestStateSync({
      room,
      game: null,
      clock: {},
      lastRequestAt: 1,
      now: BACKGROUND_STATE_SYNC_MS + 1,
      force: true,
      retryMs: BACKGROUND_STATE_SYNC_MS,
    }),
    true,
  );
});
