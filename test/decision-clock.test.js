import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionClockKey } from '../src/lib/decision-clock.js';
import { createGame, dispatchGame } from '../src/game/coup.js';

const log = [{ type: 'game_started', at: 1 }];

test('preserva o mesmo relógio durante as respostas coletivas', () => {
  const first = {
    turn: 3,
    phase: 'challenge_action',
    responseQueue: ['b', 'c', 'd'],
    log,
  };
  const afterPass = { ...first, responseQueue: ['c', 'd'] };

  assert.equal(decisionClockKey(first), decisionClockKey(afterPass));
});

test('abre um novo relógio ao mudar de fase ou de turno', () => {
  const challenge = { turn: 3, phase: 'challenge_action', log };
  const block = { turn: 3, phase: 'block', log };
  const nextTurn = { turn: 4, phase: 'turn', log };

  assert.notEqual(decisionClockKey(challenge), decisionClockKey(block));
  assert.notEqual(decisionClockKey(block), decisionClockKey(nextTurn));
});

test('duas perdas de influência no mesmo turno não herdam o relógio uma da outra', () => {
  const seats = [
    { id: 'a', name: 'Ana' },
    { id: 'b', name: 'Bia' },
    { id: 'c', name: 'Caio' },
  ];
  const setHand = (state, playerId, roles) => {
    const player = state.players.find((candidate) => candidate.id === playerId);
    player.cards = roles.map((role, index) => ({ id: `${playerId}-${role}-${index}`, role, revealed: false }));
  };

  let game = createGame(seats, { random: () => 0.42 });
  setHand(game, 'a', ['Assassina', 'Duque']);
  setHand(game, 'b', ['Duque', 'Duque']);
  setHand(game, 'c', ['Capitão', 'Capitão']);
  game.players[0].coins = 3;

  game = dispatchGame(game, { type: 'declare_action', actorId: 'a', action: 'assassinate', targetId: 'b' });
  game = dispatchGame(game, { type: 'pass', actorId: 'b' });
  game = dispatchGame(game, { type: 'challenge', actorId: 'c' }, () => 0);
  assert.equal(game.phase, 'choose_influence');
  const challengerLossKey = decisionClockKey(game);

  game = dispatchGame(game, { type: 'reveal_influence', actorId: 'c', cardId: game.players[2].cards[0].id });
  game = dispatchGame(game, { type: 'pass', actorId: 'b' });
  assert.equal(game.phase, 'choose_influence');
  assert.equal(game.turn, 1);

  assert.notEqual(decisionClockKey(game), challengerLossKey);
});
