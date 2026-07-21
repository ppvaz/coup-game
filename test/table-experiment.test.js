import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatchGame } from '../src/game/coup.js';
import {
  gameplayHTML,
  shouldFocusDecisionHourglass,
  tableExperimentHTML,
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

test('a câmera da ampulheta pertence à interface 3D e só ganha foco no próprio turno', () => {
  const html = tableExperimentHTML();
  assert.match(html, /id="tabletop-hourglass-camera"/);
  assert.match(html, /id="tabletop-hourglass-viewport"/);

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
