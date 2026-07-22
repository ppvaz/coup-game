import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatchGame } from '../src/game/coup.js';
import {
  nextTabletopIntentConfirmation,
  projectTabletopDecision,
  tabletopIntentOutcome,
} from '../src/lib/tabletop/coup-intents.js';

const seats = [
  { id: 'a', name: 'Ana' },
  { id: 'b', name: 'Bia' },
  { id: 'c', name: 'Caio' },
];

test('turno local projeta as sete ações sem decidir regras no palco', () => {
  const game = createGame(seats, { random: () => 0.42, startingPlayerId: 'a' });
  const decision = projectTabletopDecision(game, 'a');
  assert.equal(decision.kind, 'action');
  assert.equal(decision.options.length, 7);
  assert.equal(projectTabletopDecision(game, 'b'), null);
  assert.deepEqual(tabletopIntentOutcome(game, 'a', 'action:income'), {
    kind: 'command',
    command: { type: 'declare_action', actorId: 'a', action: 'income' },
  });
  assert.deepEqual(tabletopIntentOutcome(game, 'a', 'action:steal'), { kind: 'target', actionId: 'steal' });
});

test('placas desabilitadas refletem moedas e alvos, mas o motor segue autoritativo', () => {
  const game = createGame(seats, { random: () => 0.42, startingPlayerId: 'a' });
  game.players[0].coins = 10;
  const options = projectTabletopDecision(game, 'a').options;
  assert.ok(options.filter((entry) => entry.enabled).every((entry) => entry.id === 'action:coup'));
  assert.equal(tabletopIntentOutcome(game, 'a', 'action:tax'), null);

  game.players[0].coins = 2;
  game.players[1].coins = 0;
  game.players[2].coins = 0;
  assert.equal(projectTabletopDecision(game, 'a').options.find((entry) => entry.id === 'action:steal').enabled, false);
});

test('contestação, passagem e bloqueio viram os comandos existentes', () => {
  let game = createGame(seats, { random: () => 0.42, startingPlayerId: 'a' });
  game = dispatchGame(game, { type: 'declare_action', actorId: 'a', action: 'tax' });
  assert.equal(projectTabletopDecision(game, 'b').kind, 'response');
  assert.deepEqual(tabletopIntentOutcome(game, 'b', 'response:challenge').command, {
    type: 'challenge',
    actorId: 'b',
  });
  assert.deepEqual(tabletopIntentOutcome(game, 'b', 'response:pass').command, { type: 'pass', actorId: 'b' });

  game = createGame(seats, { random: () => 0.42, startingPlayerId: 'a' });
  game = dispatchGame(game, { type: 'declare_action', actorId: 'a', action: 'steal', targetId: 'b' });
  game = dispatchGame(game, { type: 'pass', actorId: 'b' });
  game = dispatchGame(game, { type: 'pass', actorId: 'c' });
  const block = projectTabletopDecision(game, 'b');
  assert.deepEqual(
    block.options.map((entry) => entry.id),
    ['block:Capitão', 'block:Embaixadora', 'response:pass'],
  );
  assert.deepEqual(tabletopIntentOutcome(game, 'b', 'block:Embaixadora').command, {
    type: 'block',
    actorId: 'b',
    role: 'Embaixadora',
  });
});

test('escolha de alvo suspende as placas de ação', () => {
  const game = createGame(seats, { random: () => 0.42, startingPlayerId: 'a' });
  assert.equal(projectTabletopDecision(game, 'a', { targeting: true }), null);
});

test('efígie exige dois toques e permite trocar ou cancelar a intenção armada', () => {
  assert.deepEqual(nextTabletopIntentConfirmation(null, 'response:challenge'), {
    kind: 'arm',
    intentId: 'response:challenge',
  });
  assert.deepEqual(nextTabletopIntentConfirmation('response:challenge', 'response:pass'), {
    kind: 'arm',
    intentId: 'response:pass',
  });
  assert.deepEqual(nextTabletopIntentConfirmation('response:pass', 'response:pass'), {
    kind: 'confirm',
    intentId: 'response:pass',
  });
  assert.deepEqual(nextTabletopIntentConfirmation('response:pass', null), {
    kind: 'cancel',
    intentId: null,
  });
});
