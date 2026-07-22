import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatchGame } from '../src/game/coup.js';
import {
  gameplayHTML,
  shouldFocusDecisionHourglass,
  tableExperimentHTML,
  tabletopInfluenceCommand,
  tabletopRosterHTML,
} from '../src/ui/table-experiment.js';

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
const context = {
  portraits,
  clock: { key: '', deadline: 0, total: 1 },
  soundsMuted: false,
  voicesMuted: true,
  labAccess: false,
  canSwitchTo2D: true,
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

test('a saída do 3D é um botão da aplicação, não uma navegação', () => {
  const html = tableExperimentHTML();
  assert.match(html, /id="tabletop-exit-leave"/);
  assert.doesNotMatch(html, /<a href="\/">/);
  assert.doesNotMatch(tableExperimentHTML({ testMode: true }), /tabletop-exit-confirm/);
});

test('a ampulheta pessoal não tem painel em HTML e só é focada no próprio turno', () => {
  // A redoma vive na cena 3D, sobre as moedas de quem decide: nada de sobrepor
  // um retângulo fixo à tela.
  assert.doesNotMatch(tableExperimentHTML(), /hourglass/);

  const game = createGame(seats, { random: () => 0.42, startingPlayerId: 'a' });
  assert.equal(shouldFocusDecisionHourglass(game, 'a'), true);
  assert.equal(shouldFocusDecisionHourglass(game, 'b'), false);

  const awaitingResponses = dispatchGame(game, { type: 'declare_action', actorId: 'a', action: 'tax' });
  assert.equal(shouldFocusDecisionHourglass(awaitingResponses, 'b'), false);
});

test('o painel da Corte oferece a volta à mesa 2D quando permitido', () => {
  const game = createGame(seats, { random: () => 0.42 });
  const allowed = tabletopRosterHTML(stateFor(game), context);
  assert.match(allowed, /id="tabletop-2d"/);
  assert.match(allowed, /aria-label="Alternar para a mesa 2D, mantendo a partida"/);
  const lab = tabletopRosterHTML(stateFor(game), { ...context, canSwitchTo2D: false });
  assert.doesNotMatch(lab, /id="tabletop-2d"/);
});

test('a revanche 3D é do anfitrião; convidados aguardam', () => {
  const game = createGame(seats, { random: () => 0.42 });
  const finished = { ...game, status: 'finished', winnerId: 'b' };
  assert.match(gameplayHTML(stateFor(finished), context), /id="tabletop-again"/);
  assert.match(gameplayHTML(stateFor(finished, { online: true, isHost: true }), context), /id="tabletop-again"/);
  const guest = gameplayHTML(stateFor(finished, { online: true, isHost: false }), context);
  assert.doesNotMatch(guest, /id="tabletop-again"/);
  assert.match(guest, /Aguardando o anfitrião/);
});

test('clique 3D só produz comando para influência local selecionável', () => {
  let game = createGame(seats, { random: () => 0.42, startingPlayerId: 'b' });
  game.players.find((player) => player.id === 'b').coins = 7;
  game = dispatchGame(game, { type: 'declare_action', actorId: 'b', action: 'coup', targetId: 'a' });
  const ownCard = game.players.find((player) => player.id === 'a').cards[0];
  const rivalCard = game.players.find((player) => player.id === 'b').cards[0];

  assert.deepEqual(tabletopInfluenceCommand(game, 'a', ownCard.id), {
    type: 'reveal_influence',
    actorId: 'a',
    cardId: ownCard.id,
  });
  assert.equal(tabletopInfluenceCommand(game, 'a', rivalCard.id), null);
  assert.equal(tabletopInfluenceCommand(game, 'b', rivalCard.id), null);
  ownCard.revealed = true;
  assert.equal(tabletopInfluenceCommand(game, 'a', ownCard.id), null);
});

test('a Embaixadora usa bancada 3D com confirmação e lista acessível como fallback', () => {
  let game = createGame(seats, { random: () => 0.42, startingPlayerId: 'a' });
  game = dispatchGame(game, { type: 'declare_action', actorId: 'a', action: 'exchange' });
  game = dispatchGame(game, { type: 'pass', actorId: 'b' });
  game = dispatchGame(game, { type: 'pass', actorId: 'c' });
  const optionIds = game.exchangeOptions.map((card) => card.id);

  const empty = gameplayHTML(stateFor(game), context);
  assert.match(empty, /tabletop-bench-decision/);
  assert.match(empty, /0 de 2 cartas selecionadas/);
  assert.match(empty, /id="confirm-exchange" disabled/);
  assert.match(empty, /id="tabletop-bench-fallback-open"/);
  assert.doesNotMatch(empty, /modal-wrap/);

  const readyState = stateFor(game, { exchangePicks: optionIds.slice(0, 2) });
  const ready = gameplayHTML(readyState, context);
  assert.match(ready, /2 de 2 cartas selecionadas/);
  assert.match(ready, /id="confirm-exchange" >/);

  const fallback = gameplayHTML(readyState, context, { benchFallbackOpen: true });
  assert.match(fallback, /modal-wrap/);
  assert.match(fallback, /id="tabletop-bench-fallback-close"/);
  assert.match(fallback, new RegExp(`data-pick="${optionIds[0]}" aria-pressed="true"`));
});
