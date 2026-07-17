import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, createGame, dispatchGame, viewForPlayer } from '../src/game/coup.js';
import { reconstructGame } from '../src/game/handover.js';
import { awaitedPlayerId, botCommand } from '../src/game/ai.js';

const seats = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase(), kind: 'human' }));

const makeRng = (seed) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const roleTally = (state) => {
  const tally = {};
  for (const card of [...state.deck, ...state.players.flatMap((player) => player.cards)]) {
    tally[card.role] = (tally[card.role] ?? 0) + 1;
  }
  return tally;
};

const handoversFrom = (game, ids) => ids.map((playerId) => ({ playerId, view: viewForPlayer(game, playerId) }));

test('reconstrói mãos reais dos que respondem e sorteia as do ausente', () => {
  const game = createGame(seats, { random: makeRng(5) });
  const rebuilt = reconstructGame('b', viewForPlayer(game, 'b'), handoversFrom(game, ['c', 'd']), makeRng(9));
  for (const id of ['b', 'c', 'd']) {
    assert.deepEqual(
      rebuilt.players.find((player) => player.id === id).cards,
      game.players.find((player) => player.id === id).cards,
    );
  }
  const absent = rebuilt.players.find((player) => player.id === 'a');
  assert.equal(absent.cards.length, 2);
  assert.ok(absent.cards.every((card) => ROLES.includes(card.role) && !card.revealed));
  assert.equal(rebuilt.deck.length, game.deck.length);
  for (const role of ROLES) assert.equal(roleTally(rebuilt)[role], 3);
  assert.doesNotThrow(() => dispatchGame(rebuilt, { type: 'declare_action', actorId: 'a', action: 'income' }));
});

test('rejeita mão informada que contradiz o que é público', () => {
  const game = createGame(seats, { random: makeRng(5) });
  const forged = handoversFrom(game, ['c']);
  forged[0].view.players.find((player) => player.id === 'c').cards = [
    { id: 'x-0', role: 'Duque', revealed: false },
    { id: 'x-1', role: 'Duque', revealed: true },
  ];
  const rebuilt = reconstructGame('b', viewForPlayer(game, 'b'), forged, makeRng(9));
  const c = rebuilt.players.find((player) => player.id === 'c');
  assert.ok(c.cards.every((card) => ROLES.includes(card.role)));
  assert.notDeepEqual(
    c.cards.map((card) => card.id),
    ['x-0', 'x-1'],
  );
  for (const role of ROLES) assert.equal(roleTally(rebuilt)[role], 3);
});

test('preserva a troca em andamento quando o ator responde ao handover', () => {
  let game = createGame(seats, { random: makeRng(7) });
  game = dispatchGame(game, { type: 'declare_action', actorId: 'a', action: 'exchange' });
  for (const id of ['b', 'c', 'd']) game = dispatchGame(game, { type: 'pass', actorId: id });
  assert.equal(game.phase, 'exchange');
  const rebuilt = reconstructGame('b', viewForPlayer(game, 'b'), handoversFrom(game, ['a', 'd']), makeRng(9));
  assert.deepEqual(rebuilt.exchangeOptions, game.exchangeOptions);
  const chosen = rebuilt.exchangeOptions.slice(0, rebuilt.pending.exchangeCount).map((card) => card.id);
  assert.doesNotThrow(() => dispatchGame(rebuilt, { type: 'choose_exchange', actorId: 'a', cardIds: chosen }));
});

test('reinventa a troca quando o ator está ausente e mantém a integridade', () => {
  let game = createGame(seats, { random: makeRng(7) });
  game = dispatchGame(game, { type: 'declare_action', actorId: 'a', action: 'exchange' });
  for (const id of ['b', 'c', 'd']) game = dispatchGame(game, { type: 'pass', actorId: id });
  const rebuilt = reconstructGame('b', viewForPlayer(game, 'b'), handoversFrom(game, ['c', 'd']), makeRng(9));
  assert.equal(rebuilt.exchangeOptions.length, game.exchangeOptions.length);
  const chosen = rebuilt.exchangeOptions.slice(0, rebuilt.pending.exchangeCount).map((card) => card.id);
  const after = dispatchGame(rebuilt, { type: 'choose_exchange', actorId: 'a', cardIds: chosen });
  for (const role of ROLES) assert.equal(roleTally(after)[role], 3);
});

test('partida reconstruída segue jogável até o fim', () => {
  const rng = makeRng(11);
  let game = createGame(seats, { random: rng });
  game = dispatchGame(game, { type: 'declare_action', actorId: 'a', action: 'income' });
  let state = reconstructGame('b', viewForPlayer(game, 'b'), handoversFrom(game, ['c', 'd']), rng);
  let steps = 0;
  while (state.status === 'playing' && steps++ < 2000) {
    state = dispatchGame(state, botCommand(state, awaitedPlayerId(state), rng));
  }
  assert.equal(state.status, 'finished');
});
