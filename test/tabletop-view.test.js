import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatchGame } from '../src/game/coup.js';
import { projectCoupTableView } from '../src/lib/tabletop/coup-view.js';

const seats = [
  { id: 'a', name: 'Ana' },
  { id: 'b', name: 'Bia' },
  { id: 'c', name: 'Caio' },
];

test('projetor da mesa nunca entrega papéis ou IDs ocultos dos rivais', () => {
  const game = createGame(seats, { random: () => 0.42 });
  const rivalSecret = game.players[1].cards[0];
  const selfSecret = game.players[0].cards[0];
  const view = projectCoupTableView(game, 'a');
  const self = view.seats.find((seat) => seat.id === 'a');
  const rival = view.seats.find((seat) => seat.id === 'b');

  assert.equal(self.influences[0].role, selfSecret.role);
  assert.equal(self.influences[0].id, selfSecret.id);
  assert.equal(rival.influences[0].role, null);
  assert.notEqual(rival.influences[0].id, rivalSecret.id);
  assert.doesNotMatch(JSON.stringify(view), new RegExp(rivalSecret.id));
  assert.equal(Object.isFrozen(view), true);
  assert.equal(Object.isFrozen(view.seats), true);
});

test('papel rival só chega ao palco depois de revelado', () => {
  const game = createGame(seats, { random: () => 0.42 });
  game.players[1].cards[0].revealed = true;
  const view = projectCoupTableView(game, 'a');
  const revealed = view.seats.find((seat) => seat.id === 'b').influences[0];

  assert.equal(revealed.revealed, true);
  assert.equal(revealed.role, game.players[1].cards[0].role);
  assert.notEqual(revealed.id, game.players[1].cards[0].id);
});

test('alegação pública vira batida visual sem resolver a verdade', () => {
  let game = createGame(seats, { random: () => 0.42 });
  game = dispatchGame(game, { type: 'declare_action', actorId: 'a', action: 'tax' });
  const view = projectCoupTableView(game, 'b');

  assert.equal(view.beat, 'claim');
  assert.equal(view.action.label, 'Imposto');
  assert.equal(view.action.claimedRole, 'Duque');
  assert.deepEqual(view.action.actor, { id: 'a', name: 'Ana' });
  assert.equal('truthful' in view.action, false);
  assert.equal(view.responsePlayer.id, 'b');
});
