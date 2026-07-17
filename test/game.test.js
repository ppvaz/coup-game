import test from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, createGame, dispatchGame, viewForPlayer } from '../src/game/coup.js';

const seats = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bia' }, { id: 'c', name: 'Caio' }];

const setHand = (state, playerId, roles) => {
  const player = state.players.find((candidate) => candidate.id === playerId);
  player.cards = roles.map((role, index) => ({ id: `${playerId}-${role}-${index}`, role, revealed: false }));
};
const activeRoles = (player) => player.cards.filter((card) => !card.revealed).map((card) => card.role);
const revealedCount = (player) => player.cards.filter((card) => card.revealed).length;
const passAll = (state, actorIds) => actorIds.reduce((current, actorId) => dispatchGame(current, { type: 'pass', actorId }), state);

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

test('contestação perdida: a carta provada é trocada e o contestador perde influência', () => {
  let state = createGame(seats, { random: () => 0.42 });
  setHand(state, 'a', ['Duque', 'Capitão']);
  state = dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'tax' });
  const deckSize = state.deck.length;
  state = dispatchGame(state, { type: 'challenge', actorId: 'b' });
  assert.equal(state.phase, 'choose_influence');
  const choice = state.players[1].cards[1];
  state = dispatchGame(state, { type: 'reveal_influence', actorId: 'b', cardId: choice.id });
  assert.ok(state.players[1].cards.find((card) => card.id === choice.id).revealed);
  assert.equal(revealedCount(state.players[1]), 1);
  assert.equal(state.players[0].coins, 5);
  assert.equal(activeRoles(state.players[0]).length, 2);
  assert.equal(state.deck.length, deckSize);
  assert.equal(state.currentPlayerId, 'b');
});

test('contestação vencida: o blefe revela influência e a ação falha', () => {
  let state = createGame(seats, { random: () => 0.42 });
  setHand(state, 'a', ['Capitão', 'Capitão']);
  state = dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'tax' });
  state = dispatchGame(state, { type: 'challenge', actorId: 'b' });
  assert.equal(state.phase, 'choose_influence');
  state = dispatchGame(state, { type: 'reveal_influence', actorId: 'a', cardId: 'a-Capitão-0' });
  assert.equal(state.players[0].coins, 2);
  assert.equal(revealedCount(state.players[0]), 1);
  assert.equal(state.currentPlayerId, 'b');
});

test('assassinato paga na declaração e o custo fica pago mesmo bloqueado', () => {
  let state = createGame(seats, { random: () => 0.42 });
  setHand(state, 'b', ['Condessa', 'Duque']);
  state.players[0].coins = 3;
  state = dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'assassinate', targetId: 'b' });
  assert.equal(state.players[0].coins, 0);
  state = passAll(state, ['b', 'c']);
  assert.equal(state.phase, 'block');
  assert.deepEqual(state.responseQueue, ['b']);
  state = dispatchGame(state, { type: 'block', actorId: 'b', role: 'Condessa' });
  state = passAll(state, ['a', 'c']);
  assert.equal(state.players[0].coins, 0);
  assert.equal(revealedCount(state.players[1]), 0);
  assert.equal(state.currentPlayerId, 'b');
});

test('bloqueio verdadeiro contestado: o contestador perde influência e a ação é bloqueada', () => {
  let state = createGame(seats, { random: () => 0.42 });
  setHand(state, 'b', ['Condessa', 'Duque']);
  state.players[0].coins = 3;
  state = dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'assassinate', targetId: 'b' });
  state = passAll(state, ['b', 'c']);
  state = dispatchGame(state, { type: 'block', actorId: 'b', role: 'Condessa' });
  state = dispatchGame(state, { type: 'challenge', actorId: 'a' });
  assert.equal(state.phase, 'choose_influence');
  state = dispatchGame(state, { type: 'reveal_influence', actorId: 'a', cardId: state.players[0].cards[0].id });
  assert.equal(revealedCount(state.players[0]), 1);
  assert.equal(activeRoles(state.players[1]).length, 2);
  assert.equal(state.players[0].coins, 0);
  assert.equal(state.currentPlayerId, 'b');
});

test('bloqueio blefado contestado: o bloqueador perde influência e a ação continua', () => {
  let state = createGame(seats, { random: () => 0.42 });
  setHand(state, 'b', ['Duque', 'Duque']);
  state = dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'steal', targetId: 'b' });
  state = passAll(state, ['b', 'c']);
  state = dispatchGame(state, { type: 'block', actorId: 'b', role: 'Capitão' });
  state = dispatchGame(state, { type: 'challenge', actorId: 'a' });
  assert.equal(state.phase, 'choose_influence');
  assert.equal(state.players[0].coins, 2);
  state = dispatchGame(state, { type: 'reveal_influence', actorId: 'b', cardId: 'b-Duque-0' });
  assert.equal(revealedCount(state.players[1]), 1);
  assert.equal(state.players[0].coins, 4);
  assert.equal(state.players[1].coins, 0);
  assert.equal(state.currentPlayerId, 'b');
});

test('golpe não abre respostas e o alvo escolhe qual influência revelar', () => {
  let state = createGame(seats, { random: () => 0.42 });
  setHand(state, 'b', ['Duque', 'Embaixador']);
  state.players[0].coins = 7;
  state = dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'coup', targetId: 'b' });
  assert.equal(state.players[0].coins, 0);
  assert.equal(state.phase, 'choose_influence');
  state = dispatchGame(state, { type: 'reveal_influence', actorId: 'b', cardId: 'b-Embaixador-1' });
  assert.deepEqual(activeRoles(state.players[1]), ['Duque']);
  assert.equal(state.currentPlayerId, 'b');
});

test('qualquer jogador pode bloquear ajuda externa', () => {
  let state = createGame(seats, { random: () => 0.42 });
  state = dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'foreign_aid' });
  assert.equal(state.phase, 'block');
  assert.deepEqual(state.responseQueue, ['b', 'c']);
  state = passAll(state, ['b']);
  state = dispatchGame(state, { type: 'block', actorId: 'c', role: 'Duque' });
  state = passAll(state, ['a', 'b']);
  assert.equal(state.players[0].coins, 2);
  assert.equal(state.currentPlayerId, 'b');
});

test('roubo leva no máximo as moedas do alvo', () => {
  let state = createGame(seats, { random: () => 0.42 });
  state.players[1].coins = 1;
  state = dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'steal', targetId: 'b' });
  state = passAll(state, ['b', 'c']);
  state = passAll(state, ['b']);
  assert.equal(state.players[0].coins, 3);
  assert.equal(state.players[1].coins, 0);
});

test('não permite roubar alvo sem moedas', () => {
  const state = createGame(seats, { random: () => 0.42 });
  state.players[1].coins = 0;
  assert.throws(() => dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'steal', targetId: 'b' }), /não possui moedas/);
});

test('não permite mirar a si mesmo nem agir sem moedas suficientes', () => {
  const state = createGame(seats, { random: () => 0.42 });
  state.players[0].coins = 7;
  assert.throws(() => dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'coup', targetId: 'a' }), /si mesmo/);
  const poor = createGame(seats, { random: () => 0.42 });
  assert.throws(() => dispatchGame(poor, { type: 'declare_action', actorId: 'a', action: 'assassinate', targetId: 'b' }), /insuficientes/);
});

test('troca do embaixador devolve as cartas não escolhidas ao baralho', () => {
  let state = createGame(seats, { random: () => 0.42 });
  const deckSize = state.deck.length;
  state = dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'exchange' });
  state = passAll(state, ['b', 'c']);
  assert.equal(state.phase, 'exchange');
  assert.equal(state.exchangeOptions.length, 4);
  assert.equal(viewForPlayer(state, 'b').exchangeOptions.length, 0);
  const chosen = state.exchangeOptions.slice(2).map((card) => card.id);
  assert.throws(() => dispatchGame(state, { type: 'choose_exchange', actorId: 'a', cardIds: [chosen[0]] }), /Quantidade/);
  assert.throws(() => dispatchGame(state, { type: 'choose_exchange', actorId: 'a', cardIds: [chosen[0], chosen[0]] }), /Quantidade/);
  state = dispatchGame(state, { type: 'choose_exchange', actorId: 'a', cardIds: chosen });
  assert.deepEqual(state.players[0].cards.map((card) => card.id), chosen);
  assert.equal(state.deck.length, deckSize);
  const all = [...state.deck, ...state.players.flatMap((player) => player.cards)];
  for (const role of ROLES) assert.equal(all.filter((card) => card.role === role).length, 3);
  assert.equal(state.currentPlayerId, 'b');
});

test('resposta fora de ordem é rejeitada e eliminados saem da fila', () => {
  let state = createGame(seats, { random: () => 0.42 });
  state.players[2].cards.forEach((card) => { card.revealed = true; });
  state = dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'tax' });
  assert.deepEqual(state.responseQueue, ['b']);
  const ordered = dispatchGame(createGame(seats, { random: () => 0.42 }), { type: 'declare_action', actorId: 'a', action: 'tax' });
  assert.throws(() => dispatchGame(ordered, { type: 'pass', actorId: 'c' }), /próximo/);
});

test('turno pula jogadores eliminados', () => {
  let state = createGame(seats, { random: () => 0.42 });
  state.players[1].cards.forEach((card) => { card.revealed = true; });
  state = dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'income' });
  assert.equal(state.currentPlayerId, 'c');
});

test('alvo que blefa o bloqueio do assassinato pode perder as duas influências', () => {
  let state = createGame(seats, { random: () => 0.42 });
  setHand(state, 'a', ['Assassina', 'Duque']);
  setHand(state, 'b', ['Duque', 'Capitão']);
  state.players[0].coins = 3;
  state = dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'assassinate', targetId: 'b' });
  state = passAll(state, ['b', 'c']);
  state = dispatchGame(state, { type: 'block', actorId: 'b', role: 'Condessa' });
  state = dispatchGame(state, { type: 'challenge', actorId: 'a' });
  assert.equal(state.phase, 'choose_influence');
  state = dispatchGame(state, { type: 'reveal_influence', actorId: 'b', cardId: 'b-Duque-0' });
  assert.equal(activeRoles(state.players[1]).length, 0);
  assert.equal(state.status, 'playing');
  assert.equal(state.currentPlayerId, 'c');
});

test('alvo eliminado na contestação não trava a ação esperando bloqueio', () => {
  let state = createGame(seats, { random: () => 0.42 });
  setHand(state, 'a', ['Assassina', 'Duque']);
  setHand(state, 'b', ['Duque', 'Capitão']);
  state.players[1].cards[1].revealed = true;
  state.players[0].coins = 3;
  state = dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'assassinate', targetId: 'b' });
  state = dispatchGame(state, { type: 'challenge', actorId: 'b' });
  assert.equal(activeRoles(state.players[1]).length, 0);
  assert.equal(state.phase, 'turn');
  assert.equal(state.currentPlayerId, 'c');
});

test('quem perde a contestação escolhe a influência e a ação continua para o bloqueio', () => {
  let state = createGame(seats, { random: () => 0.42 });
  setHand(state, 'a', ['Assassina', 'Duque']);
  setHand(state, 'b', ['Condessa', 'Duque']);
  state.players[0].coins = 3;
  state = dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'assassinate', targetId: 'b' });
  state = dispatchGame(state, { type: 'challenge', actorId: 'b' });
  assert.equal(state.phase, 'choose_influence');
  assert.throws(() => dispatchGame(state, { type: 'reveal_influence', actorId: 'a', cardId: 'a-Duque-1' }), /não deve revelar/);
  state = dispatchGame(state, { type: 'reveal_influence', actorId: 'b', cardId: 'b-Duque-1' });
  assert.deepEqual(activeRoles(state.players[1]), ['Condessa']);
  assert.equal(state.phase, 'block');
  assert.deepEqual(state.responseQueue, ['b']);
  state = dispatchGame(state, { type: 'block', actorId: 'b', role: 'Condessa' });
  state = passAll(state, ['a', 'c']);
  assert.equal(activeRoles(state.players[1]).length, 1);
  assert.equal(state.currentPlayerId, 'b');
});

test('última influência perdida define o vencedor', () => {
  let state = createGame(seats.slice(0, 2), { random: () => 0.42 });
  state.players[0].coins = 7;
  state.players[1].cards[1].revealed = true;
  state = dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'coup', targetId: 'b' });
  assert.equal(state.status, 'finished');
  assert.equal(state.phase, 'finished');
  assert.equal(state.winnerId, 'a');
  assert.throws(() => dispatchGame(state, { type: 'declare_action', actorId: 'a', action: 'income' }), /não está em andamento/);
});
