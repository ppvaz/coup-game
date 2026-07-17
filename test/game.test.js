import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatchGame, viewForPlayer } from '../src/game/coup.js';

const seats = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bia' }, { id: 'c', name: 'Caio' }];

test('mantém mãos adversárias secretas', () => {
  const state = createGame(seats, { random: () => 0.42 });
  const view = viewForPlayer(state, 'a');
  assert.ok(view.players[0].cards.every((card) => card.role));
  assert.ok(view.players[1].cards.every((card) => card.role === null));
  assert.ok(view.deck.every((card) => card.role === null));
});

test('renda resolve imediatamente e passa o turno', () => {
  const state = createGame(seats, { random: () => 0.42 });
  const next = dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'income' });
  assert.equal(next.players[0].coins, 3);
  assert.equal(next.currentPlayerId, 'b');
  assert.equal(next.phase, 'turn');
});

test('ação de personagem abre janela de contestação', () => {
  const state = createGame(seats, { random: () => 0.42 });
  const next = dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'tax' });
  assert.equal(next.phase, 'challenge_action');
  assert.deepEqual(next.responseQueue, ['b', 'c']);
  assert.equal(next.players[0].coins, 2);
});

test('dez moedas obrigam golpe', () => {
  const state = createGame(seats, { random: () => 0.42 });
  state.players[0].coins = 10;
  assert.throws(() => dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'income' }), /Golpe é obrigatório/);
});
