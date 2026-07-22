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

test('somente a própria influência fica selecionável na decisão de perda', () => {
  let game = createGame(seats, { random: () => 0.42, startingPlayerId: 'b' });
  game.players.find((player) => player.id === 'b').coins = 7;
  game = dispatchGame(game, { type: 'declare_action', actorId: 'b', action: 'coup', targetId: 'a' });
  assert.equal(game.phase, 'choose_influence');

  const victimView = projectCoupTableView(game, 'a');
  const victim = victimView.seats.find((seat) => seat.id === 'a');
  const attacker = victimView.seats.find((seat) => seat.id === 'b');
  assert.deepEqual(
    victim.influences.map((card) => card.selectable),
    [true, true],
  );
  assert.ok(attacker.influences.every((card) => card.selectable === false));

  const observerView = projectCoupTableView(game, 'c');
  assert.ok(observerView.seats.flatMap((seat) => seat.influences).every((card) => card.selectable === false));
});

test('somente a mão privada fica focalizável pelo jogador', () => {
  const game = createGame(seats, { random: () => 0.42 });
  const view = projectCoupTableView(game, 'b');
  const self = view.seats.find((seat) => seat.id === 'b');
  const rivals = view.seats.filter((seat) => seat.id !== 'b');

  assert.ok(self.influences.every((card) => card.focusable));
  assert.ok(rivals.flatMap((seat) => seat.influences).every((card) => card.focusable === false));
});

test('opções e escolhas da Embaixadora chegam somente ao palco do ator', () => {
  let game = createGame(seats, { random: () => 0.42, startingPlayerId: 'a' });
  game = dispatchGame(game, { type: 'declare_action', actorId: 'a', action: 'exchange' });
  game = dispatchGame(game, { type: 'pass', actorId: 'b' });
  game = dispatchGame(game, { type: 'pass', actorId: 'c' });
  assert.equal(game.phase, 'exchange');
  const selectedId = game.exchangeOptions[1].id;

  const actorView = projectCoupTableView(game, 'a', { exchangePicks: [selectedId, 'injetada'] });
  assert.equal(actorView.exchange.requiredCount, 2);
  assert.equal(actorView.exchange.options.length, 4);
  assert.deepEqual(
    actorView.exchange.options.map((card) => card.selected),
    [false, true, false, false],
  );
  assert.ok(actorView.exchange.options.every((card) => card.role));

  const observerView = projectCoupTableView(game, 'b', { exchangePicks: [selectedId] });
  assert.equal(observerView.exchange, null);
  assert.doesNotMatch(JSON.stringify(observerView), new RegExp(selectedId));
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

test('projeta seis jogadores com a mesma geografia para todos os observadores', () => {
  const fullTable = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, name: id.toUpperCase() }));
  const game = createGame(fullTable, { random: () => 0.42 });
  const viewA = projectCoupTableView(game, 'a');
  const viewD = projectCoupTableView(game, 'd');

  assert.equal(viewD.seats.length, 6);
  assert.deepEqual(
    viewD.seats.map((seat) => seat.id),
    ['a', 'b', 'c', 'd', 'e', 'f'],
  );
  assert.deepEqual(
    viewD.seats.map((seat) => seat.azimuthRad),
    [0, Math.PI / 3, (Math.PI * 2) / 3, Math.PI, (Math.PI * 4) / 3, (Math.PI * 5) / 3],
  );
  assert.equal(viewD.seats[3].isSelf, true);
  assert.deepEqual(
    viewD.seats.map((seat) => seat.azimuthRad),
    viewA.seats.map((seat) => seat.azimuthRad),
  );
});
