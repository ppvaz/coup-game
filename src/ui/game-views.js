import { ACTIONS, isAlive, responseProgress } from '../game/coup.js';
import { awaitedPlayerId } from '../game/ai.js';
import { chatToggleHTML, escapeHTML } from './screens.js';

export const ROLE_HINTS = {
  Duque: 'Receba 3 moedas',
  Assassina: 'Elimine por 3 moedas',
  Capitão: 'Roube até 2 moedas',
  Embaixadora: 'Troque cartas',
  Condessa: 'Bloqueia assassinato',
};
export const ACTION_ORDER = ['income', 'foreign_aid', 'tax', 'steal', 'exchange', 'assassinate', 'coup'];
const ACTION_HINTS = {
  income: '+1 moeda',
  foreign_aid: '+2 moedas',
  tax: 'Duque · +3',
  steal: 'Capitão · alvo',
  exchange: 'Embaixadora',
  assassinate: '3 moedas · alvo',
  coup: '7 moedas · alvo',
};
const BLOCK_HINTS = {
  Duque: 'Impede Ajuda Externa',
  Condessa: 'Impede Assassinato',
  Capitão: 'Impede Roubo',
  Embaixadora: 'Impede Roubo',
};
const LOG_ICONS = {
  action_declared: '♛',
  action_resolved: '+',
  challenge_resolved: '⚔',
  block_declared: '♛',
  action_blocked: '♛',
  influence_lost: '†',
  exchange_resolved: '↻',
  action_fizzled: '·',
  game_started: '·',
  game_finished: '♛',
};

const playerName = (game, id) => escapeHTML(game.players.find((player) => player.id === id)?.name ?? '?');
const roundNumber = (game) => Math.floor((game.turn - 1) / game.players.length) + 1;
const logIcon = (entry) =>
  entry.type === 'action_resolved' && entry.action === 'steal' ? '◆' : (LOG_ICONS[entry.type] ?? '·');

export function describeLog(game, entry) {
  const n = (id) => playerName(game, id);
  switch (entry.type) {
    case 'game_started':
      return 'A corte está reunida. O jogo começou.';
    case 'action_declared': {
      const action = ACTIONS[entry.action];
      const claim = action.role ? ` alegando ser ${action.role}` : '';
      const target = entry.targetId ? ` contra ${n(entry.targetId)}` : '';
      return `${n(entry.actorId)} declarou ${action.label.toLowerCase()}${claim}${target}.`;
    }
    case 'action_resolved':
      switch (entry.action) {
        case 'income':
          return `${n(entry.actorId)} recolheu 1 moeda.`;
        case 'foreign_aid':
          return `${n(entry.actorId)} recebeu ajuda externa (+2).`;
        case 'tax':
          return `${n(entry.actorId)} cobrou 3 moedas como Duque.`;
        case 'steal':
          return `${n(entry.actorId)} roubou moedas de ${n(entry.targetId)}.`;
        default:
          return `${n(entry.actorId)} resolveu ${ACTIONS[entry.action].label.toLowerCase()}.`;
      }
    case 'challenge_resolved':
      return entry.truthful
        ? `${n(entry.challengerId)} contestou, mas ${n(entry.challengedId)} provou ser ${entry.claimedRole}.`
        : `${n(entry.challengerId)} contestou ${n(entry.challengedId)}: era um blefe.`;
    case 'block_declared':
      return `${n(entry.playerId)} bloqueou alegando ser ${entry.role}.`;
    case 'action_blocked':
      return `O bloqueio de ${n(entry.playerId)} foi aceito.`;
    case 'influence_lost':
      return `${n(entry.playerId)} perdeu uma influência (${entry.role}).`;
    case 'exchange_resolved':
      return `${n(entry.playerId)} reorganizou suas influências.`;
    case 'action_fizzled':
      return `A ação de ${n(entry.actorId)} se perdeu: o alvo já havia caído.`;
    case 'game_finished':
      return entry.reason === 'humans_eliminated'
        ? `${n(entry.loserId)} caiu da corte. Os rivais tomaram o poder.`
        : `${n(entry.winnerId)} domina a corte.`;
    default:
      return '';
  }
}

export function timerHTML(game, clock, now = Date.now()) {
  if (!clock.deadline || game?.status !== 'playing') return '';
  const remaining = Math.max(0, clock.deadline - now);
  const seconds = Math.ceil(remaining / 1000);
  return `<div class="turn-timer ${seconds <= 5 ? 'urgent' : ''}"><em><i style="width:${(remaining / clock.total) * 100}%"></i></em><span>${seconds}s</span></div>`;
}

export function historyHTML(game) {
  const entries = game.log.slice(-5);
  return `<section class="chronicle"><header><span>Crônica da corte</span><small>Rodada ${roundNumber(game)}</small></header><div class="chronicle-list">${entries
    .map((entry, index) => {
      const text = describeLog(game, entry);
      const first = text.split(' ')[0];
      const detail = text.slice(first.length);
      return `<article class="chronicle-entry ${index === entries.length - 1 ? 'latest' : ''}"><i>${logIcon(entry)}</i><p><strong>${first}</strong>${detail}</p></article>`;
    })
    .join('')}</div></section>`;
}

export function playerHTML(state, player, portraits) {
  const isTurn = awaitedPlayerId(state.game) === player.id && state.game.status === 'playing';
  const connected = state.room?.seats.find((seat) => seat.id === player.id)?.connected ?? true;
  return `<div class="player ${isTurn ? 'turn' : ''} ${!isAlive(player) ? 'dead' : ''} ${connected ? '' : 'offline'}"><div class="avatar">${escapeHTML(player.name[0] ?? '?')}</div><strong title="${escapeHTML(player.name)}">${escapeHTML(player.name)}</strong>${connected ? '' : '<small class="offline-label">DESCONECTADO</small>'}<div class="coins">◆ ${player.coins} moedas</div><div class="influence">${player.cards.map((card) => (card.revealed ? `<i class="mini-card revealed" style="--mini-portrait:url('${portraits[card.role]}')"><span>${card.role}</span></i>` : '<i class="mini-card hidden" aria-label="Influência não revelada"><span>?</span></i>')).join('')}</div></div>`;
}

export function handHTML(state, portraits) {
  const game = state.game;
  const self = game.players.find((player) => player.id === state.myId);
  const myTurn = game.phase === 'turn' && game.currentPlayerId === state.myId;
  const must = self.coins >= 10;
  const someoneToRob = game.players.some((player) => player.id !== state.myId && isAlive(player) && player.coins > 0);
  const disabled = (key) =>
    !myTurn || (must && key !== 'coup') || (ACTIONS[key].cost ?? 0) > self.coins || (key === 'steal' && !someoneToRob);
  return `<footer class="hand"><div class="self-status"><span>Seu tesouro</span><b>◆ ${self.coins}</b><small>moedas</small></div>${self.cards.map((card) => `<div class="role-card ${card.revealed ? 'lost' : ''}" style="--portrait:url('${portraits[card.role]}')"><h3>${card.role}</h3><p>${card.revealed ? 'Influência revelada' : ROLE_HINTS[card.role]}</p></div>`).join('')}<div class="actions">${ACTION_ORDER.map((key) => `<button class="action" data-action="${key}" ${disabled(key) ? 'disabled' : ''}><b>${ACTIONS[key].label}</b><small>${ACTION_HINTS[key]}</small></button>`).join('')}</div></footer>`;
}

function modalAssetsHTML(game, playerId) {
  const player = game.players.find((candidate) => candidate.id === playerId);
  if (!player) return '';
  const influences = player.cards.filter((card) => !card.revealed).length;
  const coinLabel = `${player.coins} ${player.coins === 1 ? 'moeda' : 'moedas'}`;
  const influenceLabel = `${influences} ${influences === 1 ? 'influência' : 'influências'}`;
  return `<span class="modal-inline-assets">(<span class="modal-asset" title="${coinLabel}" aria-label="${coinLabel}"><i class="modal-coin-icon" aria-hidden="true">◆</i><b>${player.coins}</b></span><span aria-hidden="true">,</span><span class="modal-asset" title="${influenceLabel}" aria-label="${influenceLabel}"><svg class="modal-influence-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="1.5" width="9" height="12"/><rect x="5.5" y="3.5" width="8" height="11"/></svg><b>${influences}</b></span>)</span>`;
}

const modalPlayerHTML = (game, playerId) => `${playerName(game, playerId)} ${modalAssetsHTML(game, playerId)}`;

function otherPlayersHTML(game, excludedIds = []) {
  const excluded = new Set(excludedIds.filter(Boolean));
  const players = game.players.filter((player) => !excluded.has(player.id));
  if (!players.length) return '';
  return `<div class="modal-roster"><small>Outros jogadores</small><div>${players.map((player) => `<span class="modal-roster-player ${isAlive(player) ? '' : 'eliminated'}">${modalPlayerHTML(game, player.id)}</span>`).join('')}</div></div>`;
}

function modalActionTargetHTML(game, pending) {
  return pending.targetId
    ? ` ${ACTIONS[pending.action].label.toLowerCase()} ${modalPlayerHTML(game, pending.targetId)}`
    : '';
}

function modalContext(game) {
  const events = game.log.slice(-3).reverse();
  const revealed = game.players.flatMap((player) =>
    player.cards.filter((card) => card.revealed).map((card) => card.role),
  );
  return `<aside class="modal-context"><div class="context-title">Contexto da mesa</div><div class="context-revealed"><small>REVELADAS</small><div>${revealed.length ? revealed.map((role) => `<span>${role}</span>`).join('') : '<em>Nenhuma influência revelada</em>'}</div></div><div class="context-events">${events.map((entry) => `<p>— ${describeLog(game, entry)}</p>`).join('')}</div></aside>`;
}

export function responseProgressHTML(state) {
  if (!state.online) return '';
  const progress = responseProgress(state.game);
  if (!progress || progress.total <= 1) return '';
  const receivedLabel = progress.submitted === 1 ? 'recebida' : 'recebidas';
  const pendingLabel = progress.remaining === 1 ? 'pendente' : 'pendentes';
  const label = `${progress.submitted} ${receivedLabel}, ${progress.remaining} ${pendingLabel}`;
  return `<div class="modal-response-progress" aria-label="Progresso das respostas: ${label}"><span class="received" title="Respostas ${receivedLabel}"><i aria-hidden="true">✓</i><b>${progress.submitted}</b><small>${receivedLabel}</small></span><span class="pending" title="Respostas ${pendingLabel}"><i aria-hidden="true">◷</i><b>${progress.remaining}</b><small>${pendingLabel}</small></span></div>`;
}

function waitingModal(state, context, title, copy) {
  return `<div class="modal-wrap"><div class="modal"><div class="eyebrow">Aguardando a mesa</div><h2>${escapeHTML(title)}</h2>${otherPlayersHTML(state.game, [state.myId])}<p class="modal-copy">${escapeHTML(copy)}</p>${timerHTML(state.game, context.clock)}${responseProgressHTML(state)}</div></div>`;
}

function targetModal(state) {
  const targets = state.game.players.filter((player) => player.id !== state.myId && isAlive(player));
  return `<div class="modal-wrap"><div class="modal"><div class="eyebrow">Escolha seu rival</div><h2>${ACTIONS[state.targetAction].label}</h2><div class="targets">${targets.map((player) => `<button class="target" data-target="${player.id}" ${state.targetAction === 'steal' && player.coins === 0 ? 'disabled' : ''}><b>${escapeHTML(player.name)}</b> ${modalAssetsHTML(state.game, player.id)}</button>`).join('')}</div><button class="ghost" id="cancel">Cancelar</button></div></div>`;
}

function challengeActionModal(state, context) {
  const game = state.game;
  const pending = game.pending;
  const target = pending.targetId ? ` para${modalActionTargetHTML(game, pending)}` : '';
  return `<div class="modal-wrap"><div class="modal modal-with-context"><div class="modal-main"><div class="eyebrow">Alegação de personagem</div><h2>${modalPlayerHTML(game, pending.actorId)} diz ser ${pending.claimedRole}${target}</h2>${otherPlayersHTML(game, [pending.actorId, pending.targetId])}<p class="modal-copy">Se contestar e ele provar a carta, você perde uma influência. Se for blefe, ele perde.</p>${timerHTML(game, context.clock)}${responseProgressHTML(state)}<div class="response-actions"><button class="danger" id="challenge">Contestar alegação</button><button class="primary" id="allow">Permitir ação</button></div></div>${modalContext(game)}</div></div>`;
}

function blockChoiceModal(state, context) {
  const game = state.game;
  const pending = game.pending;
  const roles = ACTIONS[pending.action].blockedBy;
  const intent = pending.targetId
    ? `quer${modalActionTargetHTML(game, pending)}`
    : `quer ${ACTIONS[pending.action].label.toLowerCase()}`;
  return `<div class="modal-wrap"><div class="modal modal-with-context"><div class="modal-main"><div class="eyebrow">Ação bloqueável</div><h2>${modalPlayerHTML(game, pending.actorId)} ${intent}</h2>${otherPlayersHTML(game, [pending.actorId, pending.targetId])}<p class="modal-copy">Você pode impedir esta ação alegando uma das influências permitidas. Outros jogadores podem contestar seu bloqueio.</p>${timerHTML(game, context.clock)}${responseProgressHTML(state)}<div class="card-grid">${roles.map((role) => `<button class="role-card" data-block-role="${role}" style="--portrait:url('${context.portraits[role]}')"><h3>${role}</h3><p>${BLOCK_HINTS[role]}</p></button>`).join('')}</div><button class="ghost" id="allow-block">Permitir ação</button></div>${modalContext(game)}</div></div>`;
}

function blockClaimModal(state, context) {
  const game = state.game;
  const pending = game.pending;
  const block = pending.block;
  const eyebrow = pending.action === 'assassinate' ? 'Alvo do assassinato · Bloqueio declarado' : 'Bloqueio declarado';
  return `<div class="modal-wrap"><div class="modal modal-with-context"><div class="modal-main"><div class="eyebrow">${eyebrow}</div><h2>${modalPlayerHTML(game, block.playerId)} diz ser ${block.role}</h2>${otherPlayersHTML(game, [block.playerId, pending.actorId])}<p class="modal-copy">${playerName(game, block.playerId)} bloqueou ${ACTIONS[pending.action].label.toLowerCase()}. Você pode aceitar ou contestar a alegação.</p>${timerHTML(game, context.clock)}${responseProgressHTML(state)}<div class="response-actions"><button class="danger" id="contest-block">Contestar bloqueio</button><button class="primary" id="accept-block">Aceitar bloqueio</button></div></div>${modalContext(game)}</div></div>`;
}

function revealModal(state, context) {
  const game = state.game;
  const self = game.players.find((player) => player.id === state.myId);
  const options = self.cards.filter((card) => !card.revealed);
  return `<div class="modal-wrap"><div class="modal modal-with-context"><div class="modal-main"><div class="eyebrow">Influência perdida</div><h2>Escolha qual carta revelar</h2>${otherPlayersHTML(game, [state.myId])}<p class="modal-copy">A carta escolhida fica virada para cima e deixa de valer.</p>${timerHTML(game, context.clock)}<div class="card-grid">${options.map((card) => `<button class="role-card" data-reveal="${card.id}" style="--portrait:url('${context.portraits[card.role]}')"><h3>${card.role}</h3><p>${ROLE_HINTS[card.role]}</p></button>`).join('')}</div></div>${modalContext(game)}</div></div>`;
}

function exchangeModal(state, context) {
  const game = state.game;
  const count = game.pending.exchangeCount;
  const picks = state.exchangePicks;
  return `<div class="modal-wrap"><div class="modal modal-with-context"><div class="modal-main"><div class="eyebrow">Troca da Embaixadora</div><h2>Escolha ${count === 1 ? 'a carta que fica' : `as ${count} cartas que ficam`}</h2>${otherPlayersHTML(game, [state.myId])}<p class="modal-copy">As demais voltam para o baralho da corte.</p>${timerHTML(game, context.clock)}<div class="card-grid">${game.exchangeOptions.map((card) => `<button class="role-card" data-pick="${card.id}" aria-pressed="${picks.includes(card.id)}" style="--portrait:url('${context.portraits[card.role]}')">${picks.includes(card.id) ? '<span class="pick-mark">✓</span>' : ''}<h3>${card.role}</h3><p>${ROLE_HINTS[card.role]}</p></button>`).join('')}</div><div class="response-actions"><button class="primary" id="confirm-exchange" ${picks.length === count ? '' : 'disabled'}>Confirmar troca</button></div></div>${modalContext(game)}</div></div>`;
}

export function modalHTML(state, context) {
  const game = state.game;
  if (state.targetAction) return targetModal(state);
  if (game.status !== 'playing') return '';
  const head = game.responseQueue[0];
  if (game.phase === 'challenge_action') {
    if (head === state.myId) return challengeActionModal(state, context);
    return state.online
      ? waitingModal(state, context, 'Alegação em avaliação', 'Aguardando as respostas dos outros jogadores.')
      : '';
  }
  if (game.phase === 'block') {
    if (head === state.myId) return blockChoiceModal(state, context);
    return state.online
      ? waitingModal(state, context, 'Ação bloqueável', 'Aguardando a decisão de quem pode bloquear esta ação.')
      : '';
  }
  if (game.phase === 'challenge_block') {
    if (head === state.myId) return blockClaimModal(state, context);
    return state.online
      ? waitingModal(state, context, 'Bloqueio declarado', 'Aguardando as respostas dos outros jogadores.')
      : '';
  }
  if (game.phase === 'choose_influence') {
    if (game.pending.lossPlayerId === state.myId) return revealModal(state, context);
    return state.online
      ? waitingModal(
          state,
          context,
          'Influência em jogo',
          `${game.players.find((p) => p.id === game.pending.lossPlayerId)?.name ?? '?'} escolhe qual carta revelar.`,
        )
      : '';
  }
  if (game.phase === 'exchange') {
    if (game.pending.actorId === state.myId) return exchangeModal(state, context);
    return state.online
      ? waitingModal(
          state,
          context,
          'Troca em andamento',
          `${game.players.find((p) => p.id === game.pending.actorId)?.name ?? '?'} escolhe as cartas que ficam.`,
        )
      : '';
  }
  return '';
}

function soundToggleHTML(context) {
  const muted = context.soundsMuted;
  return `<button class="audio-toggle sound-toggle" id="sound-toggle" type="button" aria-pressed="${muted}" aria-label="${muted ? 'Ativar efeitos sonoros' : 'Silenciar efeitos sonoros'}"><span class="audio-icon sound-icon ${muted ? 'muted' : ''}" aria-hidden="true"><svg viewBox="0 0 24 24"><path class="sound-speaker" d="M4 9h4l5-4v14l-5-4H4Z"/><path class="sound-waves" d="M16 9.2a4 4 0 0 1 0 5.6M18.5 6.8a7.3 7.3 0 0 1 0 10.4"/></svg></span><small>${muted ? 'Sons desligados' : 'Sons ligados'}</small></button>`;
}

function voiceToggleHTML(context) {
  const muted = context.voicesMuted;
  return `<button class="audio-toggle voice-toggle" id="voice-toggle" type="button" aria-pressed="${muted}" aria-label="${muted ? 'Ativar vozes' : 'Silenciar vozes'}"><span class="audio-icon voice-icon ${muted ? 'muted' : ''}" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="8" cy="7" r="3"/><path d="M3.5 18c.5-3.3 2.2-5 4.5-5s4 1.7 4.5 5M15 8.5a3.8 3.8 0 0 1 0 5M18 6.5a6.7 6.7 0 0 1 0 9"/></svg></span><small>${muted ? 'Vozes desligadas' : 'Vozes ligadas'}</small></button>`;
}

const audioTogglesHTML = (context) =>
  `<div class="audio-toggles" role="group" aria-label="Controles de áudio">${soundToggleHTML(context)}${voiceToggleHTML(context)}</div>`;

export function gameHTML(state, context) {
  const game = state.game;
  const finished = game.status === 'finished';
  const decisionPlayerId = awaitedPlayerId(game) ?? game.currentPlayerId;
  const winner = finished ? game.players.find((player) => player.id === game.winnerId) : null;
  const result =
    game.finishReason === 'humans_eliminated'
      ? '<div class="winner defeat">Você caiu da corte</div><p class="game-result-copy">Seus rivais tomaram o poder. Reúna suas influências e tente novamente.</p>'
      : `<div class="winner">${escapeHTML(winner?.name ?? '?')} domina a corte</div>`;
  const readyPlayers = state.room?.seats.filter((seat) => seat.connected).length ?? 0;
  const waitingPlayers = state.room?.seats.filter((seat) => seat.connected && seat.joinsNextGame).length ?? 0;
  const waitingNotice = waitingPlayers
    ? `<div class="round"><span class="next-game-count" title="${waitingPlayers} ${waitingPlayers === 1 ? 'jogador entra' : 'jogadores entram'} na próxima partida">+${waitingPlayers} aguardando</span></div>`
    : '';
  const again =
    !state.online || state.isHost
      ? `<button class="primary" id="again" style="width:240px;margin-top:24px" ${state.online && readyPlayers < 2 ? 'disabled' : ''}>${state.online && readyPlayers < 2 ? 'Aguardando jogadores' : state.online ? `Jogar novamente · ${readyPlayers}` : 'Jogar novamente'}</button>`
      : '<p class="waiting">Aguardando o anfitrião abrir outra mesa…</p>';
  return `<main class="game"><nav class="gamebar"><div class="brand">LA <span>CORTE</span></div>${waitingNotice}<div class="gamebar-actions">${chatToggleHTML(state)}${audioTogglesHTML(context)}<button class="ghost" id="leave">Sair da mesa</button></div></nav><section class="board"><div class="opponents">${game.players
    .filter((player) => player.id !== state.myId)
    .map((player) => playerHTML(state, player, context.portraits))
    .join(
      '',
    )}</div><div class="center"><div class="turn-copy">${finished ? result : `É a vez de<br><b>${playerName(game, decisionPlayerId)}</b>`}</div>${finished ? '' : timerHTML(game, context.clock)}${historyHTML(game)}${finished ? again : ''}</div></section>${finished ? '' : handHTML(state, context.portraits)}${modalHTML(state, context)}</main>`;
}
