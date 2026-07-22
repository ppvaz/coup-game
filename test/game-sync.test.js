import test from 'node:test';
import assert from 'node:assert/strict';
import { gameViewWithClock, shouldAcceptGameView, shouldResetGame } from '../src/rooms/game-sync.js';

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
