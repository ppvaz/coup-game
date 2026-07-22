import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatchGame } from '../src/game/coup.js';
import {
  gameplayHTML,
  nextTabletopTargetId,
  shouldFocusDecisionHourglass,
  tableExperimentHTML,
  tabletopInfluenceCommand,
  tabletopReactionTargets,
  tabletopRosterHTML,
  tabletopTargetCommand,
  toggleTabletopHudPanel,
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
  assert.equal((allowed.match(/class="tabletop-roster-player/g) ?? []).length, seats.length);
  assert.match(allowed, /<i aria-hidden="true">◆<\/i><b>2<\/b>/);
  assert.match(allowed, /<small>\(VOCÊ\)<\/small>/);
  const lab = tabletopRosterHTML(stateFor(game), { ...context, canSwitchTo2D: false });
  assert.doesNotMatch(lab, /id="tabletop-2d"/);
});

test('arremessos da vitória podem mirar cortesãos eliminados', () => {
  const game = createGame(seats, { random: () => 0.42 });
  for (const candidate of game.players.filter((candidate) => candidate.id !== 'a')) {
    for (const card of candidate.cards) card.revealed = true;
  }
  const finished = { ...game, status: 'finished', phase: 'finished', winnerId: 'a' };

  assert.deepEqual(
    tabletopReactionTargets(finished, 'a').map((candidate) => candidate.id),
    ['b', 'c'],
  );
  assert.deepEqual(
    tabletopReactionTargets(finished, 'b').map((candidate) => candidate.id),
    ['a', 'c'],
  );
  assert.deepEqual(tabletopReactionTargets(game, 'a'), []);
});

test('as ilhas da HUD compartilham um único painel expansível', () => {
  assert.equal(toggleTabletopHudPanel(null, 'roster'), 'roster');
  assert.equal(toggleTabletopHudPanel('roster', 'reactions'), 'reactions');
  assert.equal(toggleTabletopHudPanel('reactions', 'exit'), 'exit');
  assert.equal(toggleTabletopHudPanel('exit', 'exit'), null);
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

test('seleção de alvo usa assentos 3D e conserva a lista como fallback', () => {
  const game = createGame(seats, { random: () => 0.42, startingPlayerId: 'a' });
  game.players.find((player) => player.id === 'c').coins = 0;
  const state = stateFor(game, { targetAction: 'steal' });

  const stage = gameplayHTML(state, context);
  assert.match(stage, /tabletop-target-decision/);
  assert.match(stage, /Toque no assento de um rival/);
  assert.match(stage, /id="tabletop-target-fallback-open"/);
  assert.doesNotMatch(stage, /data-target=/);

  const multiTargetGame = createGame(seats, { random: () => 0.42, startingPlayerId: 'a' });
  const confirmation = gameplayHTML(stateFor(multiTargetGame, { targetAction: 'steal' }), context, {
    selectedTargetId: 'b',
  });
  assert.match(confirmation, /Confirmar alvo/);
  assert.match(confirmation, /Roubar de Bia\?/);
  assert.match(confirmation, /id="tabletop-target-confirm"/);
  assert.match(confirmation, /id="tabletop-target-next"/);

  const fallback = gameplayHTML(state, context, { targetFallbackOpen: true });
  assert.match(fallback, /data-target="b"/);
  assert.match(fallback, /data-target="c" disabled/);

  assert.deepEqual(tabletopTargetCommand(game, 'a', 'steal', 'b'), {
    type: 'declare_action',
    actorId: 'a',
    action: 'steal',
    targetId: 'b',
  });
  assert.equal(tabletopTargetCommand(game, 'a', 'steal', 'c'), null);
  assert.equal(tabletopTargetCommand(game, 'b', 'steal', 'a'), null);
  assert.equal(nextTabletopTargetId(game, 'a', 'steal', null), 'b');
  assert.equal(nextTabletopTargetId(game, 'a', 'steal', 'b'), 'b');
  game.players.find((player) => player.id === 'c').coins = 1;
  assert.equal(nextTabletopTargetId(game, 'a', 'steal', 'b'), 'c');
  assert.equal(nextTabletopTargetId(game, 'a', 'steal', 'c'), 'b');
});

test('ações ficam na faixa 2D e intervenções usam efígies com fallback HTML', () => {
  let game = createGame(seats, { random: () => 0.42, startingPlayerId: 'a' });
  const actionBar = gameplayHTML(stateFor(game), context);
  assert.match(actionBar, /data-action="income"/);
  assert.doesNotMatch(actionBar, /Decisão no palco/);
  assert.doesNotMatch(actionBar, /tabletop-decision-fallback/);

  game = dispatchGame(game, { type: 'declare_action', actorId: 'a', action: 'tax' });
  const responseStage = gameplayHTML(stateFor(game, { myId: 'b' }), context);
  assert.match(responseStage, /Responder à alegação de Duque/);
  assert.match(responseStage, /preparar a contestação/);
  assert.doesNotMatch(responseStage, /id="challenge"/);
  const armedStage = gameplayHTML(stateFor(game, { myId: 'b' }), context, {
    armedDecisionId: 'response:challenge',
  });
  assert.match(armedStage, /Confirmar Contestar\?/);
  assert.match(armedStage, /Toque novamente na mesma efígie/);
  const responseFallback = gameplayHTML(stateFor(game, { myId: 'b' }), context, {
    decisionFallbackOpen: true,
  });
  assert.match(responseFallback, /id="challenge"/);
  assert.match(responseFallback, /id="allow"/);
  assert.doesNotMatch(responseFallback, /tabletop-decision-fallback-close/);
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
