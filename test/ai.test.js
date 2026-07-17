import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatchGame } from '../src/game/coup.js';
import * as aiModule from '../src/game/ai.js';
const { awaitedPlayerId, botCommand } = aiModule;

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
  state.players.forEach((player, index) => {
    if (index > 0) player.coins = 0;
  });
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

test('jogada de tempo esgotado é sempre legal e conservadora', () => {
  const { timeoutCommand } = aiModule;
  let state = createGame(bots, { random: makeRng(3) });
  state = dispatchGame(state, timeoutCommand(state, 'x'));
  assert.equal(state.players[0].coins, 3); // renda
  state = dispatchGame(state, timeoutCommand(state, 'y'));
  assert.equal(state.players[1].coins, 3);

  const rich = createGame(bots, { random: makeRng(3) });
  rich.players[0].coins = 10;
  const forced = timeoutCommand(rich, 'x');
  assert.equal(forced.action, 'coup');
  assert.doesNotThrow(() => dispatchGame(rich, forced));

  let claim = createGame(bots, { random: makeRng(3) });
  claim = dispatchGame(claim, { type: 'declare_action', actorId: 'x', action: 'tax' });
  claim = dispatchGame(claim, timeoutCommand(claim, 'y'));
  claim = dispatchGame(claim, timeoutCommand(claim, 'z'));
  claim = dispatchGame(claim, timeoutCommand(claim, 'w'));
  assert.equal(claim.players[0].coins, 5); // ninguém contestou

  let swap = createGame(bots, { random: makeRng(3) });
  const originalIds = swap.players[0].cards.map((card) => card.id);
  swap = dispatchGame(swap, { type: 'declare_action', actorId: 'x', action: 'exchange' });
  for (const id of ['y', 'z', 'w']) swap = dispatchGame(swap, timeoutCommand(swap, id));
  swap = dispatchGame(swap, timeoutCommand(swap, 'x'));
  assert.deepEqual(
    swap.players[0].cards.map((card) => card.id),
    originalIds,
  ); // troca por inércia mantém a mão

  let loss = createGame(bots, { random: makeRng(3) });
  loss.players[0].coins = 7;
  loss = dispatchGame(loss, { type: 'declare_action', actorId: 'x', action: 'coup', targetId: 'y' });
  assert.equal(loss.phase, 'choose_influence');
  loss = dispatchGame(loss, timeoutCommand(loss, 'y'));
  assert.equal(loss.phase, 'turn');
});
