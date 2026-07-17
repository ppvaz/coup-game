import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatchGame } from '../src/game/coup.js';
import { awaitedPlayerId, botCommand } from '../src/game/ai.js';

const bots = ['x', 'y', 'z', 'w'].map((id) => ({ id, name: id.toUpperCase(), kind: 'bot' }));

const makeRng = (seed) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

test('aponta de quem é a próxima decisão em cada fase', () => {
  let state = createGame(bots, { random: makeRng(7) });
  assert.equal(awaitedPlayerId(state), 'x');
  state = dispatchGame(state, { type: 'declare_action', actorId: 'x', action: 'tax' });
  assert.equal(awaitedPlayerId(state), 'y');
});

test('bot com dez moedas sempre declara golpe', () => {
  const state = createGame(bots, { random: makeRng(7) });
  state.players[0].coins = 10;
  const rng = makeRng(11);
  for (let attempt = 0; attempt < 20; attempt++) {
    const command = botCommand(state, 'x', rng);
    assert.equal(command.action, 'coup');
    assert.notEqual(command.targetId, 'x');
  }
});

test('bot nunca tenta roubar quando ninguém tem moedas', () => {
  const state = createGame(bots, { random: makeRng(7) });
  state.players.forEach((player, index) => { if (index > 0) player.coins = 0; });
  const rng = makeRng(13);
  for (let attempt = 0; attempt < 50; attempt++) {
    assert.notEqual(botCommand(state, 'x', rng).action, 'steal');
  }
});

test('partidas só de bots terminam sem comandos ilegais', () => {
  for (let match = 0; match < 60; match++) {
    const rng = makeRng(match + 1);
    let state = createGame(bots, { random: rng });
    let steps = 0;
    while (state.status === 'playing' && steps++ < 2000) {
      const awaited = awaitedPlayerId(state);
      state = dispatchGame(state, botCommand(state, awaited, rng));
    }
    assert.equal(state.status, 'finished');
    assert.ok(state.players.some((player) => player.id === state.winnerId));
  }
});
