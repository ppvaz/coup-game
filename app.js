import { supabase, isSupabaseConfigured, supabaseConfigError } from './src/lib/supabase.js';
import { ACTIONS, createGame, dispatchGame, viewForPlayer, isAlive } from './src/game/coup.js';
import { createRoom, dispatchRoom, generateRoomCode } from './src/rooms/room.js';
import { awaitedPlayerId, botCommand } from './src/game/ai.js';
import duquePortrait from './assets/characters/duque.png';
import assassinaPortrait from './assets/characters/assassina.png';
import capitaoPortrait from './assets/characters/capitao.png';
import embaixadorPortrait from './assets/characters/embaixador.png';
import condessaPortrait from './assets/characters/condessa.png';
import councilChamberDark from './assets/council-chamber.png';
import councilChamberLight from './assets/council-chamber-light.png';

const PORTRAITS = {
  Duque: duquePortrait,
  Assassina: assassinaPortrait,
  Capitão: capitaoPortrait,
  Embaixador: embaixadorPortrait,
  Condessa: condessaPortrait,
};
const PRIORITY_ASSETS = [councilChamberDark, councilChamberLight, ...Object.values(PORTRAITS)];
for (const source of PRIORITY_ASSETS) {
  const image = new Image();
  image.fetchPriority = 'high';
  image.decoding = 'async';
  image.src = source;
}

const ROLE_HINTS = {
  Duque: 'Receba 3 moedas',
  Assassina: 'Elimine por 3 moedas',
  Capitão: 'Roube até 2 moedas',
  Embaixador: 'Troque cartas',
  Condessa: 'Bloqueia assassinato',
};
const ACTION_ORDER = ['income', 'foreign_aid', 'tax', 'steal', 'exchange', 'assassinate', 'coup'];
const ACTION_HINTS = {
  income: '+1 moeda',
  foreign_aid: '+2 moedas',
  tax: 'Duque · +3',
  steal: 'Capitão · alvo',
  exchange: 'Embaixador',
  assassinate: '3 moedas · alvo',
  coup: '7 moedas · alvo',
};
const BLOCK_HINTS = {
  Duque: 'Impede Ajuda Externa',
  Condessa: 'Impede Assassinato',
  Capitão: 'Impede Roubo',
  Embaixador: 'Impede Roubo',
};
const NAMES = ['Lorenzo', 'Beatrice', 'Vittorio'];

const escapeHTML = (value) =>
  String(value).replace(
    /[&<>'"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char],
  );
const $ = (selector) => document.querySelector(selector);

const roomPathMatch = location.pathname.match(/^\/sala\/([A-Z2-9]{5})\/?$/i);
const inviteCode = (roomPathMatch?.[1] || new URLSearchParams(location.search).get('room') || '')
  .toUpperCase()
  .replace(/[^A-Z2-9]/g, '')
  .slice(0, 5);

let state = {
  screen: 'lobby',
  mode: inviteCode.length === 5 ? 'join' : 'bots',
  joinCode: inviteCode,
  name: '',
  error: null,
  shareCopied: false,
  online: false,
  isHost: false,
  myId: null,
  room: null,
  game: null,
  targetAction: null,
  exchangePicks: [],
};
let roomChannel = null;
let botTimer = null;

const themeToggle = $('#theme-toggle');
function paintThemeToggle() {
  const light = document.documentElement.dataset.theme === 'light';
  themeToggle.innerHTML = `<span>${light ? '☾' : '☀'}</span><small>${light ? 'Tema escuro' : 'Tema claro'}</small>`;
  themeToggle.setAttribute('aria-pressed', String(light));
  document.querySelector('meta[name="theme-color"]').content = light ? '#eee8dc' : '#090807';
}
themeToggle.onclick = () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('la-corte-theme', next);
  paintThemeToggle();
};
paintThemeToggle();

const me = () => state.game.players.find((player) => player.id === state.myId);
const playerName = (id) => escapeHTML(state.game.players.find((player) => player.id === id)?.name ?? '?');
const roundNumber = () => Math.floor((state.game.turn - 1) / state.game.players.length) + 1;
const sendRoom = (event, payload = {}) => roomChannel?.send({ type: 'broadcast', event, payload });

// ---------- Fluxo de comandos: um único motor para bots e multiplayer ----------

function dispatch(command) {
  if (state.online && !state.isHost) {
    sendRoom('command', { playerId: state.myId, command });
    state.targetAction = null;
    state.exchangePicks = [];
    render();
    return;
  }
  applyCommand(command);
}

function applyCommand(command) {
  try {
    state.game = dispatchGame(state.game, command);
  } catch (error) {
    // Comandos locais são filtrados pela UI; aqui chegam sobretudo comandos
    // remotos inválidos/atrasados, que o host simplesmente ignora.
    console.error('Comando rejeitado:', error.message, command);
    return;
  }
  state.targetAction = null;
  state.exchangePicks = [];
  render();
  syncViews();
  scheduleBots();
}

function syncViews() {
  if (!state.online || !state.isHost || !state.game) return;
  const views = Object.fromEntries(
    state.game.players.map((player) => {
      const view = viewForPlayer(state.game, player.id);
      view.log = view.log.slice(-20);
      return [player.id, view];
    }),
  );
  sendRoom('game_state', { views });
}

function scheduleBots() {
  clearTimeout(botTimer);
  if (state.online || state.game?.status !== 'playing') return;
  const awaited = awaitedPlayerId(state.game);
  const player = state.game.players.find((candidate) => candidate.id === awaited);
  if (player?.kind !== 'bot') return;
  botTimer = setTimeout(() => applyCommand(botCommand(state.game, awaited)), 650 + Math.random() * 500);
}

function startLocal() {
  const seats = [
    { id: 'me', name: state.name, kind: 'human' },
    ...NAMES.map((name, index) => ({ id: `bot-${index}`, name, kind: 'bot' })),
  ];
  state.myId = 'me';
  state.game = createGame(seats);
  state.screen = 'game';
  render();
  scheduleBots();
}

function startOnline() {
  const seats = state.room.seats.map((seat) => ({ id: seat.id, name: seat.name, kind: 'human' }));
  state.game = createGame(seats);
  state.screen = 'game';
  sendRoom('game_started', {});
  render();
  syncViews();
}

// ---------- Sala online (Supabase Realtime, host autoritativo) ----------

function connectRoom(kind) {
  if (!isSupabaseConfigured) {
    state.error =
      supabaseConfigError ||
      'Multiplayer online ainda não foi configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.';
    render();
    return;
  }
  state.error = null;
  roomChannel?.unsubscribe();
  state.myId = crypto.randomUUID();
  state.isHost = kind === 'create';
  const code = kind === 'create' ? generateRoomCode() : state.joinCode;
  roomChannel = supabase
    .channel(`la-corte:${code}`, { config: { broadcast: { self: false }, presence: { key: state.myId } } })
    .on('broadcast', { event: 'join_request' }, ({ payload }) => {
      if (!state.isHost || !state.room) return;
      try {
        state.room = dispatchRoom(state.room, {
          type: 'join',
          actorId: payload.id,
          player: { id: payload.id, name: String(payload.name ?? '').slice(0, 18) },
        });
      } catch {
        return;
      }
      sendRoom('room', { room: { ...state.room, game: null } });
      render();
    })
    .on('broadcast', { event: 'room' }, ({ payload }) => {
      if (state.isHost) return;
      state.room = payload.room;
      state.online = true;
      if (state.screen === 'lobby') state.screen = 'room';
      render();
    })
    .on('broadcast', { event: 'game_started' }, () => {
      if (state.isHost) return;
      state.screen = 'waiting_game';
      render();
    })
    .on('broadcast', { event: 'game_state' }, ({ payload }) => {
      if (state.isHost) return;
      const view = payload.views?.[state.myId];
      if (!view) return;
      state.game = view;
      state.screen = 'game';
      render();
    })
    .on('broadcast', { event: 'command' }, ({ payload }) => {
      if (!state.isHost || !state.game) return;
      if (!payload?.command || payload.command.actorId !== payload.playerId) return;
      applyCommand(payload.command);
    })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        state.error =
          'Não foi possível conectar ao Supabase. Confira a Project URL e a chave pública configuradas na Vercel.';
        state.screen = 'lobby';
        render();
        return;
      }
      if (status !== 'SUBSCRIBED') return;
      state.online = true;
      if (state.isHost) {
        state.room = createRoom({ code, hostId: state.myId, hostName: state.name });
        state.screen = 'room';
        history.replaceState(null, '', `/sala/${code}`);
        sendRoom('room', { room: { ...state.room, game: null } });
        render();
      } else {
        state.screen = 'room';
        render();
        sendRoom('join_request', { id: state.myId, name: state.name });
        setTimeout(() => {
          if (!state.room?.seats?.some((seat) => seat.id === state.myId)) {
            state.error = 'Sala não encontrada ou anfitrião offline.';
            state.screen = 'lobby';
            render();
          }
        }, 6000);
      }
    });
}

function leaveTable() {
  clearTimeout(botTimer);
  state.online = false;
  state.room = null;
  state.game = null;
  state.screen = 'lobby';
  state.targetAction = null;
  state.exchangePicks = [];
  roomChannel?.unsubscribe();
  roomChannel = null;
  history.replaceState(null, '', '/');
  render();
}

// ---------- Crônica ----------

function describeLog(entry) {
  const n = playerName;
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
      return `${n(entry.winnerId)} domina a corte.`;
    default:
      return '';
  }
}

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
const logIcon = (entry) =>
  entry.type === 'action_resolved' && entry.action === 'steal' ? '◆' : (LOG_ICONS[entry.type] ?? '·');

// ---------- Renderização ----------

function render() {
  const root = $('#app');
  if (state.screen === 'lobby') {
    root.innerHTML = lobbyHTML();
    bindLobby();
    return;
  }
  if (state.screen === 'room' || state.screen === 'waiting_game') {
    root.innerHTML = roomHTML();
    bindRoom();
    return;
  }
  root.innerHTML = gameHTML();
  bindGame();
}

function lobbyHTML() {
  return `<main class="shell"><nav class="topbar"><div class="brand">LA <span>CORTE</span></div><div class="status"><i class="dot"></i> servidor local ativo</div></nav><section class="landing"><div><div class="eyebrow">Um jogo de poder e influência</div><h1>Toda verdade<br>é um <em>risco.</em></h1><p class="lead">Blefe, negocie e elimine seus rivais. Na corte, a confiança é a moeda mais rara.</p><div class="feature-row"><div><b>2–6</b> jogadores</div><div><b>15 min</b> por partida</div><div><b>∞</b> intrigas</div></div></div><div class="glass"><h2>Entre na corte</h2><div class="sub">Escolha como deseja disputar o poder.</div><div class="mode-grid"><button class="mode ${state.mode === 'bots' ? 'active' : ''}" data-mode="bots"><span class="mode-icon">♞</span><span><strong>Contra bots</strong><small>Partida rápida contra a corte</small></span></button><button class="mode ${state.mode === 'create' ? 'active' : ''}" data-mode="create"><span class="mode-icon">♜</span><span><strong>Criar sala</strong><small>Abra uma mesa e compartilhe o código</small></span></button><button class="mode ${state.mode === 'join' ? 'active' : ''}" data-mode="join"><span class="mode-icon">⌁</span><span><strong>Entrar em sala</strong><small>Use o código enviado pelo anfitrião</small></span></button></div><div class="field"><label>Seu nome na corte</label><input id="name" maxlength="18" value="${escapeHTML(state.name)}" placeholder="Digite seu nome" /></div>${state.mode === 'join' ? `<div class="field"><label>Código da sala</label><input id="room-code" maxlength="5" value="${escapeHTML(state.joinCode || '')}" placeholder="ABCDE" autocomplete="off" /></div>` : ''}${state.error ? `<p class="form-error">${escapeHTML(state.error)}</p>` : ''}<button class="primary" id="enter">${state.mode === 'bots' ? 'Jogar contra bots' : state.mode === 'create' ? 'Criar sala privada' : 'Entrar na sala'} →</button><p class="fine">Nenhum cadastro necessário · Funciona na sua rede local</p></div></section></main>`;
}

function roomHTML() {
  const room = state.room;
  const seats = room?.seats || [];
  return `<main class="shell"><nav class="topbar"><div class="brand">LA <span>CORTE</span></div><button class="ghost" id="leave-room">Sair da sala</button></nav><section class="room-lobby glass"><div class="eyebrow">Sala privada</div><div class="room-code">${escapeHTML(room?.code || '•••••')}</div><p class="sub">Compartilhe este link; o código já acompanha o convite.</p><button class="copy-invite" id="copy-invite">${state.shareCopied ? '✓ Link copiado' : '↗ Copiar link da sala'}</button><div class="room-seats">${seats.map((seat) => `<div class="room-seat"><span class="avatar">${escapeHTML(seat.name[0] ?? '?')}</span><strong title="${escapeHTML(seat.name)}">${escapeHTML(seat.name)}</strong>${seat.id === room.hostId ? '<small>ANFITRIÃO</small>' : ''}</div>`).join('')}</div>${state.screen === 'waiting_game' ? '<p class="waiting">Aguardando o anfitrião distribuir as cartas…</p>' : state.isHost ? `<button class="primary" id="start-room" ${seats.length < 2 ? 'disabled' : ''}>Iniciar partida</button>` : '<p class="waiting">Aguardando o anfitrião iniciar…</p>'}</section></main>`;
}

function gameHTML() {
  const game = state.game;
  const winner = game.status === 'finished' ? game.players.find((player) => player.id === game.winnerId) : null;
  const again =
    !state.online || state.isHost
      ? '<button class="primary" id="again" style="width:220px;margin-top:24px">Jogar novamente</button>'
      : '<p class="waiting">Aguardando o anfitrião abrir outra mesa…</p>';
  return `<main class="game"><nav class="gamebar"><div class="brand">LA <span>CORTE</span></div><div class="round">Sessão privada · Rodada ${roundNumber()}</div><button class="ghost" id="leave">Sair da mesa</button></nav><section class="board"><div class="opponents">${game.players
    .filter((player) => player.id !== state.myId)
    .map(playerHTML)
    .join(
      '',
    )}</div><div class="center"><div class="turn-copy">${winner ? `<div class="winner">${escapeHTML(winner.name)} domina a corte</div>` : `É a vez de<br><b>${playerName(game.currentPlayerId)}</b>`}</div>${historyHTML()}${winner ? again : ''}</div></section>${!winner ? handHTML() : ''}${modalHTML()}</main>`;
}

function historyHTML() {
  const entries = state.game.log.slice(-5);
  return `<section class="chronicle"><header><span>Crônica da corte</span><small>Rodada ${roundNumber()}</small></header><div class="chronicle-list">${entries
    .map((entry, index) => {
      const text = describeLog(entry);
      const first = text.split(' ')[0];
      const detail = text.slice(first.length);
      return `<article class="chronicle-entry ${index === entries.length - 1 ? 'latest' : ''}"><i>${logIcon(entry)}</i><p><strong>${first}</strong>${detail}</p></article>`;
    })
    .join('')}</div></section>`;
}

function playerHTML(player) {
  const isTurn = state.game.currentPlayerId === player.id && state.game.status === 'playing';
  return `<div class="player ${isTurn ? 'turn' : ''} ${!isAlive(player) ? 'dead' : ''}"><div class="avatar">${escapeHTML(player.name[0] ?? '?')}</div><strong title="${escapeHTML(player.name)}">${escapeHTML(player.name)}</strong><div class="coins">◆ ${player.coins} moedas</div><div class="influence">${player.cards.map((card) => (card.revealed ? `<i class="mini-card revealed" style="--mini-portrait:url('${PORTRAITS[card.role]}')"><span>${card.role}</span></i>` : '<i class="mini-card hidden" aria-label="Influência não revelada"><span>?</span></i>')).join('')}</div></div>`;
}

function handHTML() {
  const game = state.game;
  const self = me();
  const myTurn = game.phase === 'turn' && game.currentPlayerId === state.myId;
  const must = self.coins >= 10;
  const someoneToRob = game.players.some((player) => player.id !== state.myId && isAlive(player) && player.coins > 0);
  const disabled = (key) =>
    !myTurn || (must && key !== 'coup') || (ACTIONS[key].cost ?? 0) > self.coins || (key === 'steal' && !someoneToRob);
  return `<footer class="hand"><div class="self-status"><span>Seu tesouro</span><b>◆ ${self.coins}</b><small>moedas</small></div>${self.cards.map((card) => `<div class="role-card ${card.revealed ? 'lost' : ''}" style="--portrait:url('${PORTRAITS[card.role]}')"><h3>${card.role}</h3><p>${card.revealed ? 'Influência revelada' : ROLE_HINTS[card.role]}</p></div>`).join('')}<div class="actions">${ACTION_ORDER.map((key) => `<button class="action" data-action="${key}" ${disabled(key) ? 'disabled' : ''}><b>${ACTIONS[key].label}</b><small>${ACTION_HINTS[key]}</small></button>`).join('')}</div></footer>`;
}

function modalContext() {
  const events = state.game.log.slice(-3).reverse();
  const revealed = state.game.players.flatMap((player) =>
    player.cards.filter((card) => card.revealed).map((card) => card.role),
  );
  return `<aside class="modal-context"><div class="context-title">Contexto da mesa</div><div class="context-revealed"><small>REVELADAS</small><div>${revealed.length ? revealed.map((role) => `<span>${role}</span>`).join('') : '<em>Nenhuma influência revelada</em>'}</div></div><div class="context-events">${events.map((entry) => `<p>— ${describeLog(entry)}</p>`).join('')}</div></aside>`;
}

function waitingModal(title, copy) {
  return `<div class="modal-wrap"><div class="modal"><div class="eyebrow">Aguardando a mesa</div><h2>${escapeHTML(title)}</h2><p class="modal-copy">${escapeHTML(copy)}</p></div></div>`;
}

function modalHTML() {
  const game = state.game;
  if (state.targetAction) return targetModal();
  if (game.status !== 'playing') return '';
  const head = game.responseQueue[0];
  if (game.phase === 'challenge_action') {
    if (head === state.myId) return challengeActionModal();
    return state.online ? waitingModal('Alegação em avaliação', 'Aguardando as respostas dos outros jogadores.') : '';
  }
  if (game.phase === 'block') {
    if (head === state.myId) return blockChoiceModal();
    return state.online ? waitingModal('Ação bloqueável', 'Aguardando a decisão de quem pode bloquear esta ação.') : '';
  }
  if (game.phase === 'challenge_block') {
    if (head === state.myId) return blockClaimModal();
    return state.online ? waitingModal('Bloqueio declarado', 'Aguardando as respostas dos outros jogadores.') : '';
  }
  if (game.phase === 'choose_influence') {
    if (game.pending.lossPlayerId === state.myId) return revealModal();
    return state.online
      ? waitingModal(
          'Influência em jogo',
          `${state.game.players.find((p) => p.id === game.pending.lossPlayerId)?.name ?? '?'} escolhe qual carta revelar.`,
        )
      : '';
  }
  if (game.phase === 'exchange') {
    if (game.pending.actorId === state.myId) return exchangeModal();
    return state.online
      ? waitingModal(
          'Troca em andamento',
          `${state.game.players.find((p) => p.id === game.pending.actorId)?.name ?? '?'} escolhe as cartas que ficam.`,
        )
      : '';
  }
  return '';
}

function targetModal() {
  const targets = state.game.players.filter((player) => player.id !== state.myId && isAlive(player));
  return `<div class="modal-wrap"><div class="modal"><div class="eyebrow">Escolha seu rival</div><h2>${ACTIONS[state.targetAction].label}</h2><div class="targets">${targets.map((player) => `<button class="target" data-target="${player.id}" ${state.targetAction === 'steal' && player.coins === 0 ? 'disabled' : ''}><b>${escapeHTML(player.name)}</b> · ${player.coins} moedas · ${player.cards.filter((card) => !card.revealed).length} influências</button>`).join('')}</div><button class="ghost" id="cancel">Cancelar</button></div></div>`;
}

function challengeActionModal() {
  const pending = state.game.pending;
  return `<div class="modal-wrap"><div class="modal modal-with-context"><div class="modal-main"><div class="eyebrow">Alegação de personagem</div><h2>${playerName(pending.actorId)} diz ser ${pending.claimedRole}</h2><p class="modal-copy">Se contestar e ele provar a carta, você perde uma influência. Se for blefe, ele perde.</p><div class="response-actions"><button class="danger" id="challenge">Contestar alegação</button><button class="primary" id="allow">Permitir ação</button></div></div>${modalContext()}</div></div>`;
}

function blockChoiceModal() {
  const pending = state.game.pending;
  const roles = ACTIONS[pending.action].blockedBy;
  return `<div class="modal-wrap"><div class="modal modal-with-context"><div class="modal-main"><div class="eyebrow">Ação bloqueável</div><h2>${playerName(pending.actorId)} tenta ${ACTIONS[pending.action].label.toLowerCase()}</h2><p class="modal-copy">Você pode impedir esta ação alegando uma das influências permitidas. Outros jogadores podem contestar seu bloqueio.</p><div class="card-grid">${roles.map((role) => `<button class="role-card" data-block-role="${role}" style="--portrait:url('${PORTRAITS[role]}')"><h3>${role}</h3><p>${BLOCK_HINTS[role]}</p></button>`).join('')}</div><button class="ghost" id="allow-block">Permitir ação</button></div>${modalContext()}</div></div>`;
}

function blockClaimModal() {
  const block = state.game.pending.block;
  return `<div class="modal-wrap"><div class="modal modal-with-context"><div class="modal-main"><div class="eyebrow">Bloqueio declarado</div><h2>${playerName(block.playerId)} diz ser ${block.role}</h2><p class="modal-copy">${playerName(block.playerId)} bloqueou ${ACTIONS[state.game.pending.action].label.toLowerCase()}. Você pode aceitar ou contestar a alegação.</p><div class="response-actions"><button class="danger" id="contest-block">Contestar bloqueio</button><button class="primary" id="accept-block">Aceitar bloqueio</button></div></div>${modalContext()}</div></div>`;
}

function revealModal() {
  const options = me().cards.filter((card) => !card.revealed);
  return `<div class="modal-wrap"><div class="modal modal-with-context"><div class="modal-main"><div class="eyebrow">Influência perdida</div><h2>Escolha qual carta revelar</h2><p class="modal-copy">A carta escolhida fica virada para cima e deixa de valer.</p><div class="card-grid">${options.map((card) => `<button class="role-card" data-reveal="${card.id}" style="--portrait:url('${PORTRAITS[card.role]}')"><h3>${card.role}</h3><p>${ROLE_HINTS[card.role]}</p></button>`).join('')}</div></div>${modalContext()}</div></div>`;
}

function exchangeModal() {
  const count = state.game.pending.exchangeCount;
  const picks = state.exchangePicks;
  return `<div class="modal-wrap"><div class="modal modal-with-context"><div class="modal-main"><div class="eyebrow">Troca do Embaixador</div><h2>Escolha ${count === 1 ? 'a carta que fica' : `as ${count} cartas que ficam`}</h2><p class="modal-copy">As demais voltam para o baralho da corte.</p><div class="card-grid">${state.game.exchangeOptions.map((card) => `<button class="role-card" data-pick="${card.id}" aria-pressed="${picks.includes(card.id)}" style="--portrait:url('${PORTRAITS[card.role]}')">${picks.includes(card.id) ? '<span class="pick-mark">✓</span>' : ''}<h3>${card.role}</h3><p>${ROLE_HINTS[card.role]}</p></button>`).join('')}</div><div class="response-actions"><button class="primary" id="confirm-exchange" ${picks.length === count ? '' : 'disabled'}>Confirmar troca</button></div></div>${modalContext()}</div></div>`;
}

// ---------- Eventos ----------

function bindLobby() {
  $('.fine')?.remove();
  const enter = $('#enter'),
    name = $('#name'),
    roomCode = $('#room-code');
  const valid = () => name.value.trim() && (state.mode !== 'join' || roomCode?.value.trim().length === 5);
  enter.disabled = !valid();
  document.querySelectorAll('[data-mode]').forEach(
    (button) =>
      (button.onclick = () => {
        state.mode = button.dataset.mode;
        state.error = null;
        render();
      }),
  );
  name.oninput = (event) => {
    state.name = event.target.value;
    enter.disabled = !valid();
  };
  roomCode?.addEventListener('input', (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, '');
    state.joinCode = event.target.value;
    enter.disabled = !valid();
  });
  name.onkeydown = (event) => {
    if (event.key === 'Enter' && valid()) enter.click();
  };
  enter.onclick = () => {
    const value = name.value.trim();
    if (!value || !valid()) return;
    state.name = value;
    state.joinCode = roomCode?.value.trim().toUpperCase();
    if (state.mode === 'bots') startLocal();
    else connectRoom(state.mode);
  };
}

function bindRoom() {
  $('#leave-room').onclick = leaveTable;
  $('#start-room')?.addEventListener('click', () => {
    state.room = { ...state.room, status: 'playing' };
    startOnline();
  });
  $('#copy-invite')?.addEventListener('click', async () => {
    const link = `${location.origin}/sala/${state.room.code}`;
    try {
      await navigator.clipboard.writeText(link);
      state.shareCopied = true;
      render();
      setTimeout(() => {
        state.shareCopied = false;
        render();
      }, 1800);
    } catch {
      window.prompt('Copie este convite:', link);
    }
  });
}

function bindGame() {
  $('#leave').onclick = leaveTable;
  $('#again')?.addEventListener('click', () => (state.online ? startOnline() : startLocal()));
  document.querySelectorAll('[data-action]').forEach(
    (button) =>
      (button.onclick = () => {
        const key = button.dataset.action;
        if (ACTIONS[key].targeted) {
          state.targetAction = key;
          render();
          return;
        }
        dispatch({ type: 'declare_action', actorId: state.myId, action: key });
      }),
  );
  document.querySelectorAll('[data-target]').forEach(
    (button) =>
      (button.onclick = () => {
        dispatch({
          type: 'declare_action',
          actorId: state.myId,
          action: state.targetAction,
          targetId: button.dataset.target,
        });
      }),
  );
  $('#cancel')?.addEventListener('click', () => {
    state.targetAction = null;
    render();
  });
  $('#challenge')?.addEventListener('click', () => dispatch({ type: 'challenge', actorId: state.myId }));
  $('#allow')?.addEventListener('click', () => dispatch({ type: 'pass', actorId: state.myId }));
  document
    .querySelectorAll('[data-block-role]')
    .forEach(
      (button) =>
        (button.onclick = () => dispatch({ type: 'block', actorId: state.myId, role: button.dataset.blockRole })),
    );
  $('#allow-block')?.addEventListener('click', () => dispatch({ type: 'pass', actorId: state.myId }));
  $('#contest-block')?.addEventListener('click', () => dispatch({ type: 'challenge', actorId: state.myId }));
  $('#accept-block')?.addEventListener('click', () => dispatch({ type: 'pass', actorId: state.myId }));
  document
    .querySelectorAll('[data-reveal]')
    .forEach(
      (button) =>
        (button.onclick = () =>
          dispatch({ type: 'reveal_influence', actorId: state.myId, cardId: button.dataset.reveal })),
    );
  document.querySelectorAll('[data-pick]').forEach(
    (button) =>
      (button.onclick = () => {
        const id = button.dataset.pick;
        const count = state.game.pending.exchangeCount;
        if (state.exchangePicks.includes(id)) state.exchangePicks = state.exchangePicks.filter((pick) => pick !== id);
        else if (state.exchangePicks.length < count) state.exchangePicks = [...state.exchangePicks, id];
        render();
      }),
  );
  $('#confirm-exchange')?.addEventListener('click', () =>
    dispatch({ type: 'choose_exchange', actorId: state.myId, cardIds: state.exchangePicks }),
  );
}

render();
