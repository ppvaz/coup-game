import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatchGame } from '../src/game/coup.js';
import { describeLog, gameHTML, handHTML, modalHTML, playerHTML, timerHTML } from '../src/ui/game-views.js';

const seats = [
  { id: 'a', name: 'Ana' },
  { id: 'b', name: 'Bia' },
  { id: 'c', name: 'Caio' },
];
const portraits = {
  Duque: 'u/duque',
  Assassina: 'u/assassina',
  Capitão: 'u/capitao',
  Embaixadora: 'u/embaixadora',
  Condessa: 'u/condessa',
};
const context = { portraits, clock: { key: '', deadline: 0, total: 1 }, soundsMuted: false, voicesMuted: true };
const setHand = (game, playerId, roles) => {
  const player = game.players.find((candidate) => candidate.id === playerId);
  player.cards = roles.map((role, index) => ({ id: `${playerId}-${role}-${index}`, role, revealed: false }));
};
const stateFor = (game, extra = {}) => ({
  game,
  myId: 'a',
  online: false,
  isHost: false,
  room: null,
  targetAction: null,
  exchangePicks: [],
  chatOpen: false,
  chatUnread: 0,
  ...extra,
});

test('a mesa renderiza a partida em andamento e o fim com vencedor', () => {
  const game = createGame(seats, { random: () => 0.42 });
  const playing = gameHTML(stateFor(game), context);
  assert.match(playing, /É a vez de/);
  assert.match(playing, /<b>Ana<\/b>/);
  assert.match(playing, /data-action="income"/);

  const finished = { ...game, status: 'finished', phase: 'finished', winnerId: 'b', finishReason: 'last_survivor' };
  const over = gameHTML(stateFor(finished), context);
  assert.match(over, /Bia domina a corte/);
  assert.match(over, /Jogar novamente/);

  const defeat = { ...finished, winnerId: null, finishReason: 'humans_eliminated' };
  assert.match(gameHTML(stateFor(defeat), context), /Você caiu da corte/);
});

test('rival mostra vez, queda e desconexão sem vazar cartas ocultas', () => {
  const game = createGame(seats, { random: () => 0.42 });
  const state = stateFor(game, {
    room: { code: 'ABCDE', hostId: 'a', seats: [{ id: 'b', name: 'Bia', kind: 'human', connected: false }] },
  });
  const bia = game.players[1];

  const html = playerHTML(state, bia, portraits);
  assert.match(html, /offline/);
  assert.match(html, /DESCONECTADO/);
  assert.doesNotMatch(html, /mini-card revealed/);
  assert.match(html, /aria-label="Influência não revelada"/);

  bia.cards[0].revealed = true;
  assert.match(playerHTML(state, bia, portraits), /mini-card revealed/);
  const dead = { ...bia, cards: bia.cards.map((card) => ({ ...card, revealed: true })) };
  assert.match(playerHTML(state, dead, portraits), /dead/);
});

test('a mão aplica as regras de habilitação das ações', () => {
  const game = createGame(seats, { random: () => 0.42 });
  const html = handHTML(stateFor(game), portraits);
  // 2 moedas: assassinato (3) e golpe (7) indisponíveis; renda disponível.
  assert.match(html, /data-action="assassinate" disabled/);
  assert.match(html, /data-action="coup" disabled/);
  assert.match(html, /data-action="income" >/);

  game.players[0].coins = 10;
  const mustCoup = handHTML(stateFor(game), portraits);
  assert.match(mustCoup, /data-action="income" disabled/);
  assert.match(mustCoup, /data-action="coup" >/);

  game.players[0].coins = 2;
  for (const rival of game.players.slice(1)) rival.coins = 0;
  assert.match(handHTML(stateFor(game), portraits), /data-action="steal" disabled/);
});

test('modais seguem a fase e o papel do jogador, com espera apenas no online', () => {
  let game = createGame(seats, { random: () => 0.42 });
  setHand(game, 'a', ['Duque', 'Condessa']);
  game = dispatchGame(game, { type: 'declare_action', actorId: 'a', action: 'tax' });

  // 'b' é o primeiro a responder; para 'a' (ator) o offline não mostra nada.
  assert.equal(modalHTML(stateFor(game), context), '');
  assert.match(modalHTML(stateFor(game, { online: true }), context), /Alegação em avaliação/);
  const responder = modalHTML(stateFor(game, { myId: 'b' }), context);
  assert.match(responder, /diz ser Duque/);
  assert.match(responder, /id="challenge"/);

  game = dispatchGame(game, { type: 'pass', actorId: 'b' });
  game = dispatchGame(game, { type: 'pass', actorId: 'c' });
  game = dispatchGame(game, { type: 'declare_action', actorId: 'b', action: 'foreign_aid' });
  // A fila de bloqueio segue a ordem dos assentos: 'a' responde primeiro.
  const blocker = modalHTML(stateFor(game), context);
  assert.match(blocker, /Ação bloqueável/);
  assert.match(blocker, /data-block-role="Duque"/);

  game = dispatchGame(game, { type: 'block', actorId: 'a', role: 'Duque' }, () => 0);
  const judge = modalHTML(stateFor(game, { myId: 'b' }), context);
  assert.match(judge, /Bloqueio declarado/);
  assert.match(judge, /id="contest-block"/);
});

test('revelação e troca mostram as cartas certas para o jogador certo', () => {
  let game = createGame(seats, { random: () => 0.42 });
  setHand(game, 'a', ['Assassina', 'Duque']);
  game.players[0].coins = 3;
  game = dispatchGame(game, { type: 'declare_action', actorId: 'a', action: 'assassinate', targetId: 'b' });
  game = dispatchGame(game, { type: 'pass', actorId: 'b' });
  game = dispatchGame(game, { type: 'challenge', actorId: 'c' }, () => 0);
  assert.equal(game.phase, 'choose_influence');

  const chooser = modalHTML(stateFor(game, { myId: 'c' }), context);
  assert.match(chooser, /Escolha qual carta revelar/);
  assert.match(chooser, /data-reveal="/);
  assert.equal(modalHTML(stateFor(game, { myId: 'b' }), context), '');
  assert.match(modalHTML(stateFor(game, { myId: 'b', online: true }), context), /Caio escolhe qual carta revelar/);

  let exchange = createGame(seats, { random: () => 0.42 });
  exchange = dispatchGame(exchange, { type: 'declare_action', actorId: 'a', action: 'exchange' });
  exchange = dispatchGame(exchange, { type: 'pass', actorId: 'b' });
  exchange = dispatchGame(exchange, { type: 'pass', actorId: 'c' });
  assert.equal(exchange.phase, 'exchange');

  const firstOption = exchange.exchangeOptions[0].id;
  const picker = modalHTML(stateFor(exchange, { exchangePicks: [firstOption] }), context);
  assert.match(picker, /Troca da Embaixadora/);
  assert.match(picker, new RegExp(`data-pick="${firstOption}" aria-pressed="true"`));
  assert.match(picker, /id="confirm-exchange" disabled/);
});

test('modal de alvo desabilita roubo de rival sem moedas', () => {
  const game = createGame(seats, { random: () => 0.42 });
  game.players[2].coins = 0;
  const html = modalHTML(stateFor(game, { targetAction: 'steal' }), context);
  assert.match(html, /data-target="b" >/);
  assert.match(html, /data-target="c" disabled/);
});

test('relógio urge nos segundos finais e some fora da partida', () => {
  const game = createGame(seats, { random: () => 0.42 });
  const now = 100_000;
  assert.match(timerHTML(game, { deadline: now + 20_000, total: 30_000 }, now), /20s/);
  assert.match(timerHTML(game, { deadline: now + 4_000, total: 30_000 }, now), /urgent/);
  assert.equal(timerHTML({ ...game, status: 'finished' }, { deadline: now + 4_000, total: 30_000 }, now), '');
});

test('crônica descreve eventos e escapa nomes hostis', () => {
  const game = createGame(
    [
      { id: 'a', name: '<img src=x>' },
      { id: 'b', name: 'Bia' },
    ],
    { random: () => 0.42 },
  );
  const line = describeLog(game, { type: 'action_resolved', action: 'steal', actorId: 'a', targetId: 'b' });
  assert.match(line, /&lt;img src=x&gt; roubou moedas de Bia\./);
  assert.doesNotMatch(line, /<img/);
  assert.equal(
    describeLog(game, { type: 'challenge_resolved', truthful: false, challengerId: 'b', challengedId: 'a' }),
    'Bia contestou &lt;img src=x&gt;: era um blefe.',
  );
});
