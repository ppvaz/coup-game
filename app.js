import { supabase, isSupabaseConfigured, supabaseConfigError } from './src/lib/supabase.js';
import { createGame, dispatchGame, viewForPlayer } from './src/game/coup.js';
import { reconstructGame } from './src/game/handover.js';
import { isCommandEnvelope, isGameView } from './src/game/network-schema.js';
import { createEncryptionIdentity, decryptFrom, encryptFor } from './src/lib/secure-channel.js';
import { RECONNECT_GIVE_UP_MS, trackPresence } from './src/lib/realtime.js';
import { createSoundManager } from './src/lib/sounds.js';
import { consumeLabAccess } from './src/lib/lab-access.js';
import { isLabRoute, routeFromPath } from './src/lib/routes.js';
import { botDelayMs } from './src/lib/bot-timing.js';
import { decisionClockKey } from './src/lib/decision-clock.js';
import { warmupPlan } from './src/lib/asset-warmup.js';
import { appendTabletopReaction, isTabletopReactionEnvelope } from './src/lib/tabletop/reactions.js';
import { voiceFilesForTransition } from './src/lib/voice-announcer.js';
import { CHAT_MAX_LENGTH, appendChatMessage, createChatGuard, normalizeChatText } from './src/rooms/chat.js';
import { chatPanelHTML, connectionUIHTML, lobbyHTML, roomHTML } from './src/ui/screens.js';
import { bindGameDecisionControls, gameHTML } from './src/ui/game-views.js';
import {
  HOST_GRACE_MS,
  continuityPlan,
  createRoom,
  dispatchRoom,
  generateRoomCode,
  hostElection,
  nextGameSeats,
  presenceDiverges,
  syncRoomPresence,
} from './src/rooms/room.js';
import { clearOnlineSession, loadOnlineSession, saveOnlineSession } from './src/rooms/session.js';
import {
  BACKGROUND_STATE_SYNC_MS,
  gameViewWithClock,
  needsBackgroundStateSync,
  needsGameViewSync,
  shouldAcceptGameView,
  shouldRequestStateSync,
  shouldResetGame,
} from './src/rooms/game-sync.js';
import { canAcceptRoomSnapshot, hasRoomSeat, startJoinAttempt } from './src/rooms/join.js';
import { createSubscriptionHandler } from './src/rooms/connection.js';
import { pendingCommandAction, rememberCommandReceipt } from './src/rooms/reliable-command.js';
import {
  authorizeRoomSeat,
  broadcastRoomEvent,
  registerRoomConnection,
  roomConnectionRegistry,
} from './src/rooms/auth.js';
import {
  isChatHistory,
  isChatMessageEnvelope,
  isChatRejection,
  isChatRequest,
  isCommandAck,
  isHandoverRequest,
  isHandoverResponse,
  isJoinRequest,
  isPresenceState,
  isPrivateEnvelope,
  isPublicKey,
  isRoomEnvelope,
  isStateSyncRequest,
} from './src/rooms/network-schema.js';
import { awaitedPlayerId, botCommand, timeoutCommand } from './src/game/ai.js';
import { DEFAULT_LOCAL_BOT_COUNT, localBotSeats, normalizeLocalBotCount } from './src/game/local-bots.js';
import { mountTableExperiment, tableExperimentHTML } from './src/ui/table-experiment.js';
import { loadCharacter } from './src/lib/tabletop/coup-table/character.js';
import duquePortrait from './assets/characters/duque.webp';
import assassinaPortrait from './assets/characters/assassina.webp';
import capitaoPortrait from './assets/characters/capitao.webp';
import embaixadoraPortrait from './assets/characters/embaixadora.webp';
import condessaPortrait from './assets/characters/condessa.webp';
import councilChamberDark from './assets/council-chamber.webp';
import councilChamberLight from './assets/council-chamber-light.webp';

const PORTRAITS = {
  Duque: duquePortrait,
  Assassina: assassinaPortrait,
  Capitão: capitaoPortrait,
  Embaixadora: embaixadoraPortrait,
  Condessa: condessaPortrait,
};
const VOICE_ASSETS = import.meta.glob('./assets/voices/**/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
});
const voiceAssetURLs = (files) => files.map((file) => VOICE_ASSETS[`./assets/voices/${file}`]).filter(Boolean);
const preloadImage = (source, priority) => {
  const image = new Image();
  image.fetchPriority = priority;
  image.decoding = 'async';
  image.src = source;
};
const warmup = warmupPlan({
  theme: document.documentElement.dataset.theme,
  chambers: { dark: councilChamberDark, light: councilChamberLight },
  portraits: PORTRAITS,
});
for (const source of warmup.immediate) preloadImage(source, 'high');
// timeout garante retratos aquecidos bem antes de a primeira partida começar.
const warmIdleAssets = () => warmup.idle.forEach((source) => preloadImage(source, 'low'));
if ('requestIdleCallback' in window) requestIdleCallback(warmIdleAssets, { timeout: 4000 });
else setTimeout(warmIdleAssets, 1500);

const DEFAULT_GAME_PRESENTATION = '3d';
// Relógio por fase, em segundos: estourou, a autoridade joga o padrão conservador.
const PHASE_SECONDS = {
  turn: 30,
  challenge_action: 20,
  block: 20,
  challenge_block: 20,
  choose_influence: 20,
  exchange: 30,
};

const $ = (selector) => document.querySelector(selector);

const labAccess = consumeLabAccess({
  href: location.href,
  secret: import.meta.env.VITE_CORTE_3D_LAB_KEY || (import.meta.env.DEV ? 'corte-lab' : ''),
  storage: localStorage,
});
if (labAccess.consumed) history.replaceState(history.state, '', labAccess.cleanPath);
const requestedRoute = routeFromPath(location.pathname);
if (isLabRoute(requestedRoute) && !labAccess.allowed) history.replaceState(history.state, '', '/');
const route = isLabRoute(requestedRoute) && !labAccess.allowed ? routeFromPath('/') : requestedRoute;
const isTabletopLab = route.name === 'lab';
const isModelGallery = route.name === 'models';
const inviteCode = (route.code || new URLSearchParams(location.search).get('room') || '')
  .toUpperCase()
  .replace(/[^A-Z2-9]/g, '')
  .slice(0, 5);
const resumeSnapshot = isLabRoute(route) ? null : loadOnlineSession(sessionStorage, inviteCode);

let state = {
  screen: 'lobby',
  // Apresentação da partida: o estado e as regras não mudam entre 2D e 3D.
  presentation: DEFAULT_GAME_PRESENTATION,
  mode: inviteCode.length === 5 ? 'join' : 'bots',
  botCount: DEFAULT_LOCAL_BOT_COUNT,
  // Cenário 3D escolhido na entrada (Salão × Conselho). É apresentação, não
  // regra; por ora vale nas partidas locais.
  scenario: 'classic',
  // Cosmético e local: a aparência do jogador entra no palco pela view, sem
  // tocar o estado autoritativo nem a rede. Rivais sem escolha caem no padrão.
  appearances: {},
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
  connection: 'idle',
  presenceReady: false,
  hostIssue: null,
  chatOpen: false,
  chatMessages: [],
  chatDraft: '',
  chatUnread: 0,
  chatError: null,
  commandError: null,
  tabletopReactions: [],
};
if (resumeSnapshot) {
  state = {
    ...state,
    mode: 'join',
    name: resumeSnapshot.name,
    online: true,
    isHost: resumeSnapshot.room.hostId === resumeSnapshot.myId,
    myId: resumeSnapshot.myId,
    room: resumeSnapshot.room,
    game: resumeSnapshot.game,
    screen: resumeSnapshot.game ? 'game' : 'room',
    connection: 'connecting',
    chatMessages: (resumeSnapshot.chatMessages ?? []).reduce(
      (messages, message) => appendChatMessage(messages, normalizeIncomingChat(message)),
      [],
    ),
  };
}
let roomChannel = null;
let activeRoomCode = null;
let authorizedHostId = null;
let connectionRegistry = new Map();
let botTimer = null;
let clock = { key: '', deadline: 0, total: 0 };
let hostElectionTimer = null;
let handoverTimer = null;
let handoverRetryTimer = null;
let handover = null;
let encryptionIdentity = null;
let connectionId = null;
let warnedClockKey = '';
let lastStateSyncRequestAt = 0;
const lastStateSyncResponseByConnection = new Map();
let pendingCommand = null;
const processedCommandReceipts = new Map();
let chatErrorTimer = null;
let reconnectingSince = 0;
let lastTabletopReactionAt = 0;
let tableExperimentController = null;
let tableExperimentMount = null;
let modelGalleryMount = null;
// A sessão de validação do laboratório senta seis cadeiras; a revanche
// precisa saber qual mesa local recriar quando a partida foi aberta pelo
// fluxo comum.
let localGameKind = 'standard';
if (resumeSnapshot?.game) {
  clock = {
    key: 'restored',
    deadline: Date.now() + Math.max(0, resumeSnapshot.clockRemaining ?? 0),
    total: resumeSnapshot.clockTotal || 1,
  };
}

const themeToggle = $('#theme-toggle');
const sounds = createSoundManager();
// A fonte fica configurável para permitir testes com arquivos locais ignorados
// pelo Git e, futuramente, uma URL publicada sem alterar o motor de áudio.
// Sem trilha instalada o controle de música nem chega a ser renderizado.
const SOUNDTRACK = import.meta.env.VITE_CORTE_SOUNDTRACK || null;
const gameViewContext = () => ({
  portraits: PORTRAITS,
  appearances: state.appearances,
  clock,
  soundsMuted: sounds.isMuted(),
  voicesMuted: sounds.isVoicesMuted(),
  musicAvailable: Boolean(SOUNDTRACK),
  musicMuted: sounds.isMusicMuted(),
  labAccess: labAccess.allowed,
  canSwitchTo2D: !isTabletopLab,
});
const chatGuard = createChatGuard();
const musicShouldPlay = () => isTabletopLab || (state.screen === 'game' && Boolean(state.game));
const startMusic = () => (musicShouldPlay() ? sounds.playMusic(SOUNDTRACK) : false);
const syncMusic = () => {
  if (musicShouldPlay()) startMusic();
  else sounds.stopMusic();
};
// O navegador só libera áudio depois de um gesto, então a trilha começa junto
// com o desbloqueio do contexto, e não na carga da página.
const unlockSounds = async () => {
  await sounds.unlock().catch(() => {});
  syncMusic();
};
document.addEventListener('pointerdown', unlockSounds, { once: true });
document.addEventListener('keydown', unlockSounds, { once: true });
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

const sendRoom = (event, payload = {}) => {
  if (!supabase || !activeRoomCode || !connectionId) return Promise.resolve('error');
  return broadcastRoomEvent(supabase, {
    code: activeRoomCode,
    connectionId,
    event,
    payload,
  });
};

function addTabletopReaction(value) {
  const next = appendTabletopReaction(state.tabletopReactions, value, {
    playerIds: state.game?.players.map((player) => player.id) ?? [],
  });
  if (next === state.tabletopReactions) return false;
  state.tabletopReactions = next;
  return true;
}

function sendTabletopReaction(draft) {
  if (!state.game || !state.myId || Date.now() - lastTabletopReactionAt < 700) return;
  const reaction = {
    ...draft,
    id: crypto.randomUUID(),
    playerId: state.myId,
    sentAt: Date.now(),
  };
  if (!addTabletopReaction(reaction)) return;
  lastTabletopReactionAt = reaction.sentAt;
  if (state.online) sendRoom('tabletop_reaction', { ...reaction, senderId: state.myId });
  render();
}

function announceGameState(previous, next) {
  if (!next) return;
  const voices = voiceAssetURLs(voiceFilesForTransition(previous, next));
  if (voices.length) sounds.playVoices(voices);
  const voicePlaying = sounds.isVoicePlaying();
  if (next.status === 'finished' && previous?.status !== 'finished') {
    if (!voicePlaying) sounds.play(next.winnerId === state.myId ? 'victory' : 'defeat');
    return;
  }
  const before = previous ? awaitedPlayerId(previous) : null;
  const after = awaitedPlayerId(next);
  if (after === state.myId && before !== state.myId) {
    if (!voicePlaying) sounds.play('turn');
    return;
  }
  const previousEvent = previous?.log?.at(-1)?.at;
  const nextEvent = next.log?.at(-1)?.at;
  if (previous && nextEvent && nextEvent !== previousEvent && !voicePlaying) sounds.play('action');
}

function publicRoom() {
  return state.room ? { ...state.room, game: null } : null;
}

function persistSession() {
  if (!state.online || !state.room || !state.myId) return;
  saveOnlineSession(sessionStorage, {
    code: state.room.code,
    myId: state.myId,
    name: state.name,
    room: publicRoom(),
    game: state.game,
    clockRemaining: Math.max(0, clock.deadline - Date.now()),
    clockTotal: clock.total,
    chatMessages: state.chatMessages,
  });
}

function broadcastRoom() {
  if (!state.isHost || !state.room) return;
  sendRoom('room', { room: publicRoom() });
  persistSession();
}

function setChatError(message, duration = 4_000) {
  clearTimeout(chatErrorTimer);
  state.chatError = message;
  chatErrorTimer = setTimeout(() => {
    state.chatError = null;
    if (state.chatOpen) render();
  }, duration);
}

function normalizeIncomingChat(message) {
  return {
    id: String(message?.id ?? '').slice(0, 80),
    playerId: String(message?.playerId ?? '').slice(0, 80),
    playerName: String(message?.playerName ?? '').slice(0, 18),
    text: message?.text,
    sentAt: Number(message?.sentAt) || Date.now(),
    kind: message?.kind === 'taunt' ? 'taunt' : 'message',
  };
}

function addChatMessage(message, notify = true) {
  const normalized = normalizeIncomingChat(message);
  const next = appendChatMessage(state.chatMessages, normalized);
  if (next === state.chatMessages) return false;
  state.chatMessages = next;
  if (notify && normalized.playerId !== state.myId) {
    if (!state.chatOpen) state.chatUnread += 1;
    sounds.play('message');
  }
  persistSession();
  return true;
}

async function sendPrivateChat(event, recipientId, value) {
  if (!encryptionIdentity) return false;
  const presence = validatedPresenceState();
  if (!presence) return false;
  const recipients = presence[recipientId] ?? [];
  const sends = recipients
    .filter((recipient) => recipient.publicKey && recipient.connectionId)
    .map(async (recipient) => {
      const encrypted = await encryptFor(encryptionIdentity, recipient.publicKey, value);
      return sendRoom(event, {
        recipientId,
        recipientConnectionId: recipient.connectionId,
        senderId: state.myId,
        senderConnectionId: connectionId,
        encrypted,
      });
    });
  await Promise.allSettled(sends);
  return sends.length > 0;
}

async function readPrivateChat(payload) {
  if (
    !encryptionIdentity ||
    !isPrivateEnvelope(payload) ||
    payload.recipientId !== state.myId ||
    payload.recipientConnectionId !== connectionId
  )
    return null;
  const sender = presenceEntry(payload.senderId, payload.senderConnectionId);
  if (!sender?.publicKey) return null;
  try {
    return await decryptFrom(encryptionIdentity, sender.publicKey, payload.encrypted);
  } catch {
    return null;
  }
}

function rejectChat(playerId, retryAfter) {
  const seconds = Math.max(1, Math.ceil(retryAfter / 1000));
  const message = `Muitas mensagens. Aguarde ${seconds}s para continuar.`;
  if (playerId === state.myId) setChatError(message, retryAfter);
  else sendPrivateChat('chat_rejected', playerId, { retryAfter });
}

function acceptChatRequest(payload) {
  if (!state.isHost || !state.room) return;
  const seat = state.room.seats.find(
    (candidate) => candidate.id === payload?.playerId && candidate.kind === 'human' && candidate.connected,
  );
  if (!seat) return;
  const result = chatGuard.accept(seat.id, payload.text);
  if (!result.ok) {
    if (result.reason === 'cooldown') rejectChat(seat.id, result.retryAfter);
    return;
  }
  const message = {
    id: crypto.randomUUID(),
    playerId: seat.id,
    playerName: seat.name,
    text: result.text,
    sentAt: Date.now(),
    kind: payload.kind,
  };
  addChatMessage(message, seat.id !== state.myId);
  for (const recipient of state.room.seats.filter((seat) => seat.kind === 'human' && seat.id !== state.myId)) {
    sendPrivateChat('chat_message', recipient.id, { message });
  }
  render();
}

async function submitChat(value, kind = 'message') {
  const text = normalizeChatText(value);
  if (!text || !state.online) return;
  if (state.connection !== 'connected' || state.hostIssue) {
    setChatError('Reconecte-se à mesa antes de enviar mensagens.');
    render();
    return;
  }
  state.chatDraft = '';
  const request = { playerId: state.myId, text, kind };
  if (state.isHost) acceptChatRequest(request);
  else {
    const sent = await sendPrivateChat('chat_request', state.room.hostId, request);
    if (!sent) setChatError('O anfitrião ainda não está disponível. Tente novamente em instantes.');
  }
  render();
}

function sendChatHistory(recipientId) {
  if (!state.isHost) return;
  sendPrivateChat('chat_history', recipientId, { messages: state.chatMessages });
}

// ---------- Fluxo de comandos: um único motor para bots e multiplayer ----------

function dispatch(command) {
  if (state.online && !state.isHost) {
    if (pendingCommand || !state.game || state.connection !== 'connected' || state.hostIssue) return;
    pendingCommand = {
      requestId: crypto.randomUUID(),
      hostId: state.room.hostId,
      gameId: state.game.gameId,
      baseVersion: state.game.version,
      command,
      createdAt: Date.now(),
      lastSentAt: 0,
    };
    state.commandError = null;
    deliverPendingCommand();
    state.targetAction = null;
    state.exchangePicks = [];
    render();
    return;
  }
  applyCommand(command);
}

function applyCommand(command) {
  const previous = state.game;
  try {
    state.game = dispatchGame(state.game, command);
  } catch (error) {
    // Comandos locais são filtrados pela UI; aqui chegam sobretudo comandos
    // remotos inválidos/atrasados, que o host simplesmente ignora.
    console.error('Comando rejeitado:', error.message, command);
    return false;
  }
  announceGameState(previous, state.game);
  if (state.online && state.isHost && previous?.status !== 'finished' && state.game.status === 'finished') {
    state.room = { ...state.room, status: 'finished', version: state.room.version + 1, updatedAt: Date.now() };
    broadcastRoom();
  }
  state.targetAction = null;
  state.exchangePicks = [];
  resetClock();
  render();
  syncViews();
  scheduleBots();
  return true;
}

async function deliverPendingCommand() {
  const pending = pendingCommand;
  if (!pending) return;
  pending.lastSentAt = Date.now();
  const result = await sendRoom('command', {
    requestId: pending.requestId,
    gameId: pending.gameId,
    baseVersion: pending.baseVersion,
    playerId: state.myId,
    command: pending.command,
  });
  if (pendingCommand === pending && result !== 'ok') pending.lastSentAt = 0;
}

function clearPendingCommand(message = null) {
  pendingCommand = null;
  state.commandError = message;
}

function watchPendingCommand() {
  if (!pendingCommand || !state.online) return;
  const action = pendingCommandAction(pendingCommand, {
    hostId: state.room?.hostId,
    gameId: state.game?.gameId,
    version: state.game?.version ?? 0,
    connection: state.connection,
  });
  if (action === 'send') {
    deliverPendingCommand();
    return;
  }
  if (action === 'confirmed') {
    clearPendingCommand();
    return;
  }
  if (action === 'stale' || action === 'timeout') {
    clearPendingCommand('Sua jogada não foi confirmada. A mesa foi sincronizada antes de permitir outra decisão.');
    requestStateSync({ force: true, refreshGame: true });
    render();
  }
}
setInterval(watchPendingCommand, 250);

function presenceEntry(playerId, targetConnectionId) {
  const entries = validatedPresenceState()?.[playerId] ?? [];
  return targetConnectionId ? entries.find((entry) => entry.connectionId === targetConnectionId) : entries.at(-1);
}

function projectedGameView(playerId) {
  const view = gameViewWithClock(viewForPlayer(state.game, playerId), clock);
  view.log = view.log.slice(-20);
  return view;
}

async function sendGameView(playerId, recipient, view = projectedGameView(playerId)) {
  if (!recipient?.publicKey || !recipient.connectionId) return 'error';
  const encrypted = await encryptFor(encryptionIdentity, recipient.publicKey, view);
  return sendRoom('game_state', {
    recipientId: playerId,
    recipientConnectionId: recipient.connectionId,
    senderId: state.myId,
    senderConnectionId: connectionId,
    encrypted,
  });
}

async function syncViews() {
  if (!state.online || !state.isHost || !state.game || !encryptionIdentity) return;
  const presence = validatedPresenceState();
  if (!presence) return;
  const sends = [];
  for (const player of state.game.players.filter((candidate) => candidate.id !== state.myId)) {
    const view = projectedGameView(player.id);
    for (const recipient of presence[player.id] ?? []) {
      if (!recipient.publicKey || !recipient.connectionId) continue;
      sends.push(sendGameView(player.id, recipient, view));
    }
  }
  await Promise.allSettled(sends);
  persistSession();
}

async function requestStateSync({ force = false, retryMs, refreshGame = false } = {}) {
  if (!state.online || state.isHost || !state.room || !connectionId) return;
  const now = Date.now();
  if (
    !shouldRequestStateSync({
      room: state.room,
      game: state.game,
      clock,
      lastRequestAt: lastStateSyncRequestAt,
      now,
      force,
      retryMs,
    })
  )
    return;
  lastStateSyncRequestAt = now;
  const result = await sendRoom('state_sync_request', {
    hostId: state.room.hostId,
    roomVersion: state.room.version,
    gameId: state.game?.gameId ?? null,
    version: state.game?.version ?? 0,
    refreshGame,
  });
  if (result !== 'ok') lastStateSyncRequestAt = 0;
}

function resetClock() {
  const game = state.game;
  if (!game || game.status !== 'playing') {
    clock = { key: '', deadline: 0, total: 0 };
    return;
  }
  const key = decisionClockKey(game);
  if (key === clock.key) return;
  const total = (PHASE_SECONDS[game.phase] ?? 30) * 1000;
  clock = { key, deadline: Date.now() + total, total };
}

function tickClock() {
  if (isTabletopLab) return;
  if (!state.game || state.game.status !== 'playing' || !clock.deadline) return;
  const remaining = Math.max(0, clock.deadline - Date.now());
  const seconds = Math.ceil(remaining / 1000);
  document.querySelectorAll('.turn-timer').forEach((element) => {
    element.classList.toggle('urgent', seconds <= 5);
    element.querySelector('i').style.width = `${(remaining / clock.total) * 100}%`;
    element.querySelector('span').textContent = `${seconds}s`;
  });
  if (seconds <= 5 && warnedClockKey !== clock.key && awaitedPlayerId(state.game) === state.myId) {
    warnedClockKey = clock.key;
    sounds.play('warning');
  }
  if (remaining > 0) return;
  if (state.online && !state.isHost) {
    requestStateSync({ refreshGame: true });
    return; // somente o host decide pelo ausente
  }
  const awaited = awaitedPlayerId(state.game);
  if (!awaited) return;
  applyCommand(timeoutCommand(state.game, awaited));
}
setInterval(tickClock, 250);

// Vigia da continuidade: a corrente de setTimeout da carência pode ser
// estrangulada em aba de fundo, e uma sincronização de presença pode chegar
// antes do nosso próprio track e ser descartada. Reavalia mesas instáveis e
// desiste de reconexões que passaram do teto em vez de prender o jogador.
function watchTableContinuity() {
  if (!state.online || !state.room) return;
  if (
    state.connection === 'reconnecting' &&
    reconnectingSince &&
    Date.now() - reconnectingSince > RECONNECT_GIVE_UP_MS
  ) {
    state.error = 'Não foi possível reconectar à mesa. Verifique sua conexão e entre novamente com o código.';
    leaveTable();
    return;
  }
  const presence = roomChannel ? validatedPresenceState() : {};
  if (!presence) return;
  const connectedIds = Object.keys(presence);
  const diverges = presenceDiverges(state.room, connectedIds);
  if (!state.isHost) {
    const urgent = state.hostIssue || diverges || needsGameViewSync(state.room, state.game);
    if (urgent || needsBackgroundStateSync(state.room, state.game)) {
      requestStateSync({ force: true, retryMs: urgent ? undefined : BACKGROUND_STATE_SYNC_MS });
    }
  }
  if (state.hostIssue || diverges) handlePresenceSync();
}
setInterval(watchTableContinuity, 2_000);

function scheduleBots() {
  clearTimeout(botTimer);
  if (isTabletopLab || state.online || state.game?.status !== 'playing') return;
  const awaited = awaitedPlayerId(state.game);
  const player = state.game.players.find((candidate) => candidate.id === awaited);
  if (player?.kind !== 'bot') return;
  const delay = botDelayMs();
  botTimer = setTimeout(() => applyCommand(botCommand(state.game, awaited)), delay);
}

function startLocal() {
  localGameKind = 'standard';
  warnedClockKey = '';
  const previousWinnerId = state.game?.winnerId;
  const seats = localBotSeats(state.name, state.botCount);
  state.myId = 'me';
  state.appearances = { [state.myId]: loadCharacter() };
  state.tabletopReactions = [];
  state.game = createGame(seats, { stopWhenHumansEliminated: true, startingPlayerId: previousWinnerId });
  announceGameState(null, state.game);
  state.screen = 'game';
  resetClock();
  render();
  scheduleBots();
}

function resetTabletopLocalGame() {
  localGameKind = 'tabletop';
  clearTimeout(botTimer);
  warnedClockKey = '';
  const previousWinnerId = state.game?.winnerId;
  state.name ||= 'Lorenzo';
  state.myId = 'me';
  state.appearances = { [state.myId]: loadCharacter() };
  state.tabletopReactions = [];
  state.game = createGame(
    [
      { id: 'me', name: state.name, kind: 'human' },
      { id: 'bot-0', name: 'Beatrice', kind: 'bot' },
      { id: 'bot-1', name: 'Vittorio', kind: 'bot' },
      { id: 'bot-2', name: 'Isabella', kind: 'bot' },
      { id: 'bot-3', name: 'Catarina', kind: 'bot' },
      { id: 'bot-4', name: 'Otávio', kind: 'bot' },
    ],
    { stopWhenHumansEliminated: true, startingPlayerId: previousWinnerId },
  );
  state.screen = 'game';
  state.targetAction = null;
  state.exchangePicks = [];
  announceGameState(null, state.game);
  resetClock();
}

function resetTabletopLabScene() {
  clearTimeout(botTimer);
  warnedClockKey = '';
  state.name ||= 'Lorenzo';
  state.myId = 'me';
  state.appearances = { [state.myId]: loadCharacter() };
  state.tabletopReactions = [];
  state.game = createGame(
    [
      { id: 'me', name: state.name, kind: 'human' },
      { id: 'bot-0', name: 'Beatrice', kind: 'bot' },
      { id: 'bot-1', name: 'Vittorio', kind: 'bot' },
      { id: 'bot-2', name: 'Isabella', kind: 'bot' },
      { id: 'bot-3', name: 'Catarina', kind: 'bot' },
      { id: 'bot-4', name: 'Otávio', kind: 'bot' },
    ],
    { stopWhenHumansEliminated: true },
  );
  state.screen = 'game';
  state.targetAction = null;
  state.exchangePicks = [];
  clock = { key: '', deadline: 0, total: 0 };
}

function startTabletopLocal() {
  resetTabletopLocalGame();
  render();
  scheduleBots();
}

function startOnline() {
  warnedClockKey = '';
  const previousWinnerId = state.game?.winnerId;
  state.tabletopReactions = [];
  clearPendingCommand();
  processedCommandReceipts.clear();
  const readySeats = nextGameSeats(state.room);
  if (readySeats.length < 2) {
    render();
    return;
  }
  const seats = readySeats.map((seat) => ({ id: seat.id, name: seat.name, kind: 'human' }));
  const gameId = crypto.randomUUID();
  state.game = createGame(seats, { gameId, startingPlayerId: previousWinnerId });
  announceGameState(null, state.game);
  state.screen = 'game';
  state.room = dispatchRoom(state.room, {
    type: 'start_game',
    actorId: state.myId,
    gameId,
    playerIds: seats.map((seat) => seat.id),
  });
  resetClock();
  sendRoom('game_started', { room: publicRoom() });
  broadcastRoom();
  render();
  syncViews();
}

// ---------- Sala online (Supabase Realtime, host autoritativo) ----------

function clearHostElection() {
  clearTimeout(hostElectionTimer);
  hostElectionTimer = null;
}

function acceptRoom(incoming) {
  if (
    !canAcceptRoomSnapshot(incoming, {
      code: state.room?.code ?? state.joinCode,
      playerId: state.myId,
      isHost: state.isHost,
    })
  )
    return false;
  if (state.room && incoming.version < state.room.version) return false;
  if (shouldResetGame(state.game, incoming.activeGameId)) {
    state.game = null;
    clearPendingCommand();
    state.targetAction = null;
    state.exchangePicks = [];
    clock = { key: '', deadline: 0, total: 0 };
  }
  state.room = incoming;
  state.isHost = incoming.hostId === state.myId;
  state.online = true;
  state.connection = 'connected';
  if (incoming.status === 'playing') state.screen = state.game ? 'game' : 'waiting_game';
  else if (state.screen !== 'game') state.screen = 'room';
  persistSession();
  return true;
}

const samePublicKey = (left, right) =>
  isPublicKey(left) &&
  isPublicKey(right) &&
  left.kty === right.kty &&
  left.crv === right.crv &&
  left.x === right.x &&
  left.y === right.y;

async function refreshConnectionRegistry() {
  if (!supabase || !activeRoomCode) return false;
  const registry = await roomConnectionRegistry(supabase, activeRoomCode);
  if (!registry) return false;
  connectionRegistry = registry;
  return true;
}

function boundConnection(playerId, targetConnectionId, publicKey) {
  const registered = connectionRegistry.get(targetConnectionId);
  return Boolean(
    registered &&
    registered.room_code === activeRoomCode &&
    registered.user_id === playerId &&
    (!publicKey || samePublicKey(registered.encryption_public_key, publicKey)),
  );
}

async function hasBoundSender(payload) {
  if (boundConnection(payload?.senderId, payload?.senderConnectionId)) return true;
  return (await refreshConnectionRegistry()) && boundConnection(payload?.senderId, payload?.senderConnectionId);
}

function validatedPresenceState() {
  const presence = roomChannel?.presenceState();
  if (!isPresenceState(presence)) return null;
  const bound = Object.entries(presence).every(([playerId, entries]) =>
    entries.every((entry) => boundConnection(playerId, entry.connectionId, entry.publicKey)),
  );
  return bound ? presence : null;
}

async function handlePresenceSync() {
  if (!roomChannel || !state.room || !state.online) return;
  if (!(await refreshConnectionRegistry())) return;
  const presence = validatedPresenceState();
  if (!presence) return;
  const connectedIds = Object.keys(presence);
  // O snapshot inicial pode chegar antes do nosso próprio track. Não tratamos
  // esse instante como uma queda coletiva.
  if (!connectedIds.includes(state.myId)) return;

  state.presenceReady = true;
  const previousVersion = state.room.version;
  state.room = syncRoomPresence(state.room, connectedIds);
  if (state.isHost && state.room.version !== previousVersion) {
    broadcastRoom();
    syncViews();
  }

  const plan = continuityPlan(state.room, { myId: state.myId, handoverActive: Boolean(handover) });
  clearHostElection();
  if (plan.action === 'close') {
    closeTableForInsufficientPlayers();
    return;
  }
  state.hostIssue =
    plan.hostIssue?.status === 'promoting'
      ? { status: 'promoting', candidateId: state.myId, candidateName: state.name }
      : plan.hostIssue;
  if (plan.action === 'promote') {
    beginHostPromotion();
    return;
  }
  if (plan.recheckMs) hostElectionTimer = setTimeout(handlePresenceSync, plan.recheckMs);
  render();
  if (plan.hostIssue?.status !== 'promoting') persistSession();
}

function beginHostPromotion() {
  if (handover || !state.room || state.room.hostId === state.myId) return;
  const previousHostId = state.room.hostId;
  try {
    state.room = dispatchRoom(state.room, {
      type: 'promote_host',
      actorId: state.myId,
      now: Date.now(),
      graceMs: HOST_GRACE_MS,
    });
  } catch {
    handlePresenceSync();
    return;
  }

  state.hostIssue = { status: 'promoting', candidateId: state.myId, candidateName: state.name };
  if (!state.game || !['playing', 'finished'].includes(state.room.status)) {
    finishHostPromotion();
    return;
  }

  handover = { id: crypto.randomUUID(), previousHostId, responses: new Map() };
  const requestId = handover.id;
  const requestHandoverViews = () => {
    if (handover?.id !== requestId) return;
    sendRoom('handover_request', {
      requestId,
      successorId: state.myId,
      successorConnectionId: connectionId,
      previousHostId,
    });
  };
  requestHandoverViews();
  clearInterval(handoverRetryTimer);
  handoverRetryTimer = setInterval(requestHandoverViews, 400);
  clearTimeout(handoverTimer);
  handoverTimer = setTimeout(finishHostPromotion, 1_400);
  render();
}

async function finishHostPromotion() {
  clearTimeout(handoverTimer);
  handoverTimer = null;
  clearInterval(handoverRetryTimer);
  handoverRetryTimer = null;
  const previousHostId = handover?.previousHostId ?? state.room?.hostId;
  if (handover && state.game) {
    try {
      state.game = reconstructGame(
        state.myId,
        state.game,
        [...handover.responses].map(([playerId, view]) => ({ playerId, view })),
      );
    } catch (error) {
      console.error('Não foi possível reconstruir a partida:', error);
      state.room = { ...state.room, hostId: handover.previousHostId };
      state.hostIssue = { status: 'failed', candidateName: state.name };
      handover = null;
      render();
      return;
    }
  }

  handover = null;
  state.isHost = true;
  state.connection = 'connected';
  state.hostIssue = null;
  if (state.game) {
    state.screen = 'game';
    resetClock();
  }
  if ((await sendRoom('host_changed', { room: publicRoom() })) !== 'ok') {
    state.room = { ...state.room, hostId: previousHostId };
    state.isHost = false;
    state.hostIssue = { status: 'failed', candidateName: state.name };
    state.error = 'O Supabase não confirmou a troca de anfitrião.';
    render();
    return;
  }
  authorizedHostId = state.myId;
  broadcastRoom();
  render();
  syncViews();
  persistSession();
}

async function replyToHandover(payload) {
  if (
    !isHandoverRequest(payload) ||
    payload.successorId === state.myId ||
    !state.game ||
    !encryptionIdentity ||
    payload.previousHostId !== state.room?.hostId
  )
    return;
  const election = hostElection(state.room);
  if (election.candidateId !== payload.successorId || election.status === 'stable') return;
  const successor = presenceEntry(payload.successorId, payload.successorConnectionId);
  if (!successor?.publicKey) return;
  try {
    const encrypted = await encryptFor(encryptionIdentity, successor.publicKey, state.game);
    sendRoom('handover_response', {
      requestId: payload.requestId,
      successorId: payload.successorId,
      successorConnectionId: payload.successorConnectionId,
      playerId: state.myId,
      senderConnectionId: connectionId,
      encrypted,
    });
  } catch {
    // A chave passou pelo schema, mas ainda pode não representar um ponto EC válido.
  }
}

async function collectHandover(payload) {
  if (
    !handover ||
    !isHandoverResponse(payload) ||
    payload.requestId !== handover.id ||
    payload.successorId !== state.myId ||
    payload.successorConnectionId !== connectionId ||
    !encryptionIdentity
  )
    return;
  if (!state.room.seats.some((seat) => seat.id === payload.playerId && seat.connected)) return;
  const sender = presenceEntry(payload.playerId, payload.senderConnectionId);
  if (!sender?.publicKey) return;
  try {
    const view = await decryptFrom(encryptionIdentity, sender.publicKey, payload.encrypted);
    if (
      !isGameView(view, {
        viewerId: payload.playerId,
        expectedGameId: state.room.activeGameId,
        expectedPlayerIds: state.room.activePlayerIds,
      })
    )
      return;
    handover?.responses.set(payload.playerId, view);
    const expectedResponders = new Set(
      state.game.players
        .filter(
          (player) =>
            player.id !== state.myId && state.room.seats.some((seat) => seat.id === player.id && seat.connected),
        )
        .map((player) => player.id),
    );
    if ([...expectedResponders].every((playerId) => handover?.responses.has(playerId))) {
      clearInterval(handoverRetryTimer);
      handoverRetryTimer = null;
    }
  } catch {
    // Resposta corrompida ou destinada a outra eleição: é ignorada.
  }
}

async function connectRoom(kind) {
  if (!isSupabaseConfigured) {
    state.error =
      supabaseConfigError ||
      'Multiplayer online ainda não foi configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.';
    render();
    return;
  }
  const resume = kind === 'resume';
  state.error = null;
  state.connection = 'connecting';
  reconnectingSince = 0;
  state.presenceReady = false;
  roomChannel?.unsubscribe();
  roomChannel = null;
  activeRoomCode = null;
  authorizedHostId = null;
  connectionRegistry = new Map();
  lastStateSyncRequestAt = 0;
  lastStateSyncResponseByConnection.clear();
  const nextConnectionId = crypto.randomUUID();
  connectionId = nextConnectionId;
  render();
  try {
    const identity = await createEncryptionIdentity();
    if (connectionId !== nextConnectionId) return;
    encryptionIdentity = identity;
  } catch {
    state.error = 'Este navegador não oferece a criptografia necessária para o multiplayer.';
    state.connection = 'idle';
    state.screen = 'lobby';
    render();
    return;
  }

  let access;
  try {
    access = await authorizeRoomSeat(supabase, {
      kind,
      code: state.room?.code || state.joinCode,
      name: state.name,
      generateCode: generateRoomCode,
    });
    if (connectionId !== nextConnectionId) return;
    if (resume && resumeSnapshot?.myId !== access.userId) {
      throw new Error('A sessão autenticada mudou. Entre novamente pelo convite da sala.');
    }
    state.myId = access.userId;
    state.name = access.name;
    state.isHost = access.isHost;
    activeRoomCode = access.code;
    authorizedHostId = access.hostId;
    await registerRoomConnection(supabase, {
      code: access.code,
      connectionId,
      publicKey: encryptionIdentity.publicKey,
    });
    if (!(await refreshConnectionRegistry())) throw new Error('Não foi possível confirmar a conexão autenticada.');
  } catch (error) {
    if (connectionId !== nextConnectionId) return;
    state.error = error.message;
    state.connection = 'idle';
    state.screen = 'lobby';
    state.online = false;
    connectionId = null;
    encryptionIdentity = null;
    activeRoomCode = null;
    authorizedHostId = null;
    clearOnlineSession(sessionStorage);
    render();
    return;
  }

  if (!resume) {
    state.chatMessages = [];
    state.chatDraft = '';
    state.chatUnread = 0;
    state.chatError = null;
  }
  const code = access.code;
  const channel = supabase.channel(`la-corte:${code}`, {
    config: { private: true, broadcast: { self: false }, presence: { key: state.myId, enabled: true } },
  });
  roomChannel = channel
    .on('broadcast', { event: 'join_request' }, async ({ payload }) => {
      if (!state.isHost || !state.room) return;
      if (!isJoinRequest(payload) || !(await hasBoundSender(payload))) return;
      await refreshConnectionRegistry();
      const presence = isJoinRequest(payload) ? presenceEntry(payload.id) : null;
      if (!presence || presence.connectionId !== payload.senderConnectionId || presence.name !== payload.name) return;
      try {
        const room =
          state.room.status === 'playing' && !state.room.activePlayerIds?.length && state.game
            ? { ...state.room, activePlayerIds: state.game.players.map((player) => player.id) }
            : state.room;
        state.room = dispatchRoom(room, {
          type: 'join',
          actorId: payload.id,
          player: { id: payload.id, name: String(payload.name ?? '').slice(0, 18) },
        });
      } catch {
        return;
      }
      broadcastRoom();
      syncViews();
      sendChatHistory(payload.id);
      render();
    })
    .on('broadcast', { event: 'room' }, async ({ payload }) => {
      const expectedHostId = state.room?.hostId ?? authorizedHostId;
      if (
        !isRoomEnvelope(payload) ||
        !(await hasBoundSender(payload)) ||
        payload.senderId !== expectedHostId ||
        payload.room.hostId !== payload.senderId
      )
        return;
      if (acceptRoom(payload.room)) {
        render();
        if (needsGameViewSync(payload.room, state.game)) requestStateSync({ force: true });
      }
    })
    .on('broadcast', { event: 'host_changed' }, async ({ payload }) => {
      if (!state.room || !isRoomEnvelope(payload) || !(await hasBoundSender(payload))) return;
      const election = hostElection(state.room);
      if (payload.room.hostId !== payload.senderId || election.candidateId !== payload.senderId) return;
      if (!acceptRoom(payload.room)) return;
      authorizedHostId = payload.senderId;
      handover = null;
      clearTimeout(handoverTimer);
      clearInterval(handoverRetryTimer);
      handoverRetryTimer = null;
      state.hostIssue = null;
      state.connection = 'connected';
      lastStateSyncRequestAt = 0;
      render();
      requestStateSync({ force: true });
    })
    .on('broadcast', { event: 'game_started' }, async ({ payload }) => {
      if (
        state.isHost ||
        !isRoomEnvelope(payload) ||
        !(await hasBoundSender(payload)) ||
        payload.senderId !== state.room?.hostId ||
        payload.room.hostId !== payload.senderId
      )
        return;
      warnedClockKey = '';
      if (acceptRoom(payload.room)) {
        render();
        if (needsGameViewSync(payload.room, state.game)) requestStateSync({ force: true });
      }
    })
    .on('broadcast', { event: 'game_state' }, async ({ payload }) => {
      if (state.isHost) return;
      if (
        !isPrivateEnvelope(payload) ||
        payload.recipientId !== state.myId ||
        payload.recipientConnectionId !== connectionId ||
        payload.senderId !== state.room?.hostId ||
        !encryptionIdentity
      )
        return;
      const sender = presenceEntry(payload.senderId, payload.senderConnectionId);
      if (!sender?.publicKey) return;
      let view;
      try {
        view = await decryptFrom(encryptionIdentity, sender.publicKey, payload.encrypted);
      } catch {
        return;
      }
      if (
        !isGameView(view, {
          viewerId: state.myId,
          expectedGameId: state.room?.activeGameId,
          expectedPlayerIds: state.room?.activePlayerIds,
        })
      )
        return;
      if (!shouldAcceptGameView(state.game, view, state.room?.activeGameId)) return;
      const previous = state.game;
      if (pendingCommand?.gameId === view.gameId && view.version > pendingCommand.baseVersion) {
        clearPendingCommand();
      }
      state.game = view;
      if (!pendingCommand) state.commandError = null;
      announceGameState(previous, view);
      state.screen = 'game';
      state.connection = 'connected';
      clock =
        view.status === 'playing'
          ? {
              key: decisionClockKey(view),
              deadline: Date.now() + Math.max(0, view.clockRemaining ?? 0),
              total: view.clockTotal || 1,
            }
          : { key: '', deadline: 0, total: 0 };
      persistSession();
      lastStateSyncRequestAt = 0;
      render();
    })
    .on('broadcast', { event: 'state_sync_request' }, async ({ payload }) => {
      if (!state.isHost || !state.room || !isStateSyncRequest(payload) || !(await hasBoundSender(payload))) return;
      const recipient = presenceEntry(payload.senderId, payload.senderConnectionId);
      if (!recipient || !hasRoomSeat(state.room, payload.senderId)) return;
      const now = Date.now();
      const previousResponse = lastStateSyncResponseByConnection.get(payload.senderConnectionId) ?? 0;
      if (now - previousResponse < 1_000) return;
      lastStateSyncResponseByConnection.set(payload.senderConnectionId, now);
      const hostChanged = payload.hostId !== state.room.hostId;
      const roomChanged = payload.roomVersion === undefined || payload.roomVersion !== state.room.version;
      if (hostChanged) await sendRoom('host_changed', { room: publicRoom() });
      else if (roomChanged) await sendRoom('room', { room: publicRoom() });
      const gameChanged =
        state.game && (payload.gameId !== state.game.gameId || payload.version !== state.game.version);
      if (
        state.game?.players.some((player) => player.id === payload.senderId) &&
        (payload.refreshGame || gameChanged)
      ) {
        await sendGameView(payload.senderId, recipient).catch(() => {});
      }
    })
    .on('broadcast', { event: 'command' }, ({ payload }) => {
      if (!state.isHost || !state.game) return;
      const playerIds = state.game.players.map((player) => player.id);
      if (!isCommandEnvelope(payload, { playerIds }) || !presenceEntry(payload.playerId, payload.senderConnectionId))
        return;
      // Clientes carregados antes do protocolo de ACK continuam funcionando
      // durante um deploy gradual, embora sem a garantia de reentrega.
      if (!payload.requestId) {
        applyCommand(payload.command);
        return;
      }
      const receiptKey = `${payload.playerId}:${payload.requestId}`;
      let receipt = processedCommandReceipts.get(receiptKey);
      if (!receipt) {
        const currentGame = state.game;
        const matchesBase = payload.gameId === currentGame.gameId && payload.baseVersion === currentGame.version;
        const accepted = matchesBase && applyCommand(payload.command);
        receipt = rememberCommandReceipt(processedCommandReceipts, receiptKey, {
          gameId: state.game?.gameId ?? payload.gameId,
          version: state.game?.version ?? payload.baseVersion,
          accepted: Boolean(accepted),
          reason: accepted ? 'applied' : matchesBase ? 'invalid' : 'stale',
        });
      }
      sendRoom('command_ack', {
        requestId: payload.requestId,
        recipientId: payload.playerId,
        recipientConnectionId: payload.senderConnectionId,
        ...receipt,
      });
    })
    .on('broadcast', { event: 'command_ack' }, async ({ payload }) => {
      if (
        state.isHost ||
        !pendingCommand ||
        !isCommandAck(payload) ||
        payload.recipientId !== state.myId ||
        payload.recipientConnectionId !== connectionId ||
        payload.senderId !== state.room?.hostId ||
        payload.requestId !== pendingCommand.requestId ||
        !(await hasBoundSender(payload))
      )
        return;
      const needsRefresh = payload.accepted && (state.game?.version ?? 0) < payload.version;
      clearPendingCommand(
        payload.accepted ? null : 'A mesa mudou antes de confirmar sua jogada. O estado foi atualizado.',
      );
      if (needsRefresh || !payload.accepted) {
        lastStateSyncRequestAt = 0;
        requestStateSync({ force: true, refreshGame: true });
      }
      render();
    })
    .on('broadcast', { event: 'chat_request' }, async ({ payload }) => {
      if (!state.isHost) return;
      const request = await readPrivateChat(payload);
      if (!isChatRequest(request) || request.playerId !== payload.senderId) return;
      acceptChatRequest(request);
    })
    .on('broadcast', { event: 'chat_message' }, async ({ payload }) => {
      if (payload?.senderId !== state.room?.hostId) return;
      const accepted = await readPrivateChat(payload);
      if (isChatMessageEnvelope(accepted) && addChatMessage(accepted.message)) render();
    })
    .on('broadcast', { event: 'chat_history' }, async ({ payload }) => {
      if (state.isHost || payload?.senderId !== state.room?.hostId) return;
      const history = await readPrivateChat(payload);
      if (!isChatHistory(history)) return;
      const merged = [...history.messages, ...state.chatMessages].sort((left, right) => left.sentAt - right.sentAt);
      state.chatMessages = merged.reduce(
        (messages, message) => appendChatMessage(messages, normalizeIncomingChat(message)),
        [],
      );
      persistSession();
      if (state.chatOpen) render();
    })
    .on('broadcast', { event: 'chat_rejected' }, async ({ payload }) => {
      if (payload?.senderId !== state.room?.hostId) return;
      const rejection = await readPrivateChat(payload);
      if (!isChatRejection(rejection)) return;
      const retryAfter = rejection.retryAfter;
      setChatError(`Muitas mensagens. Aguarde ${Math.ceil(retryAfter / 1000)}s para continuar.`, retryAfter);
      render();
    })
    .on('broadcast', { event: 'tabletop_reaction' }, ({ payload }) => {
      if (!state.game) return;
      const playerIds = state.game.players.map((player) => player.id);
      if (
        !isTabletopReactionEnvelope(payload, { playerIds }) ||
        !presenceEntry(payload.playerId, payload.senderConnectionId)
      )
        return;
      if (addTabletopReaction(payload)) render();
    })
    .on('broadcast', { event: 'handover_request' }, ({ payload }) => replyToHandover(payload))
    .on('broadcast', { event: 'handover_response' }, ({ payload }) => collectHandover(payload))
    .on('presence', { event: 'sync' }, handlePresenceSync)
    .subscribe(
      createSubscriptionHandler({
        kind,
        isCurrent: () => roomChannel === channel,
        hasRoom: () => Boolean(state.room),
        track: () =>
          trackPresence(channel, {
            playerId: state.myId,
            name: state.name,
            onlineAt: new Date().toISOString(),
            connectionId,
            publicKey: encryptionIdentity.publicKey,
          }),
        effects: {
          markReconnecting() {
            if (state.connection !== 'reconnecting') reconnectingSince = Date.now();
            state.connection = 'reconnecting';
            render();
          },
          failConnection() {
            state.error =
              'Não foi possível conectar ao Supabase. Confira a Project URL e a chave pública configuradas na Vercel.';
            state.screen = 'lobby';
            state.connection = 'idle';
            render();
          },
          markSubscribed() {
            reconnectingSince = 0;
            state.online = true;
            state.connection = kind === 'join' ? 'connecting' : 'connected';
          },
          presenceFailed() {
            state.error = 'O canal abriu, mas não foi possível registrar sua cadeira. Tente entrar novamente.';
            leaveTable();
          },
          reclaimSeat() {
            sendRoom('join_request', { id: state.myId, name: state.name, resume: true });
            if (state.isHost) {
              broadcastRoom();
              syncViews();
            }
            handlePresenceSync();
            render();
            persistSession();
            requestStateSync({ force: true });
          },
          openCreatedRoom() {
            state.room = createRoom({ code, hostId: state.myId, hostName: state.name });
            state.screen = 'room';
            history.replaceState(null, '', `/sala/${code}`);
            broadcastRoom();
            render();
            persistSession();
          },
          resumeSeat() {
            history.replaceState(null, '', `/sala/${code}`);
            render();
            sendRoom('join_request', { id: state.myId, name: state.name, resume: true });
            if (state.isHost) {
              broadcastRoom();
              syncViews();
            }
            handlePresenceSync();
            persistSession();
            requestStateSync({ force: true });
          },
          beginJoin() {
            // A rede é agendada antes do primeiro render: se a UI lançar, o
            // join_request e o timeout continuam valendo (regressão DM9HH).
            startJoinAttempt({
              isActive: () => roomChannel === channel,
              hasSeat: () => hasRoomSeat(state.room, state.myId),
              send: () => sendRoom('join_request', { id: state.myId, name: state.name }).catch(() => {}),
              onTimeout: () => {
                roomChannel = null;
                connectionId = null;
                encryptionIdentity = null;
                activeRoomCode = null;
                authorizedHostId = null;
                connectionRegistry = new Map();
                lastStateSyncRequestAt = 0;
                lastStateSyncResponseByConnection.clear();
                state.online = false;
                state.room = null;
                state.error = 'Sala não encontrada ou anfitrião offline.';
                state.screen = 'lobby';
                state.connection = 'idle';
                channel.untrack();
                channel.unsubscribe();
                render();
              },
            });
            state.screen = 'room';
            history.replaceState(null, '', `/sala/${code}`);
            render();
            persistSession();
          },
        },
      }),
    );
  render();
}

function leaveTable() {
  // Uma escolha explícita pelo 2D vale durante a mesa atual. Ao voltar ao
  // salão, a próxima partida começa novamente na experiência padrão.
  state.presentation = DEFAULT_GAME_PRESENTATION;
  clearTimeout(botTimer);
  clearHostElection();
  clearTimeout(handoverTimer);
  clearInterval(handoverRetryTimer);
  clearTimeout(chatErrorTimer);
  handover = null;
  warnedClockKey = '';
  clock = { key: '', deadline: 0, total: 0 };
  state.online = false;
  state.room = null;
  state.game = null;
  state.screen = 'lobby';
  state.targetAction = null;
  state.exchangePicks = [];
  state.connection = 'idle';
  reconnectingSince = 0;
  state.hostIssue = null;
  state.chatOpen = false;
  state.chatMessages = [];
  state.chatDraft = '';
  state.chatUnread = 0;
  state.chatError = null;
  state.commandError = null;
  state.tabletopReactions = [];
  clearOnlineSession(sessionStorage);
  const channel = roomChannel;
  roomChannel = null;
  connectionId = null;
  encryptionIdentity = null;
  activeRoomCode = null;
  authorizedHostId = null;
  connectionRegistry = new Map();
  lastStateSyncRequestAt = 0;
  lastStateSyncResponseByConnection.clear();
  clearPendingCommand();
  processedCommandReceipts.clear();
  channel?.untrack();
  channel?.unsubscribe();
  history.replaceState(null, '', '/');
  render();
}

function closeTableForInsufficientPlayers() {
  state.error = 'A mesa foi encerrada porque não restaram jogadores conectados suficientes.';
  leaveTable();
}

// ---------- Crônica ----------

// ---------- Renderização ----------

function render() {
  try {
    renderApp();
  } catch (error) {
    console.error('Falha ao renderizar a tela:', error);
    // O salão é o fallback; se nem ele renderiza, não há para onde cair.
    if (state.screen === 'lobby') throw error;
    state.error = 'Algo deu errado ao desenhar a mesa. Você voltou ao salão.';
    leaveTable();
  }
}

function switchTo2D() {
  state.presentation = '2d';
  render();
}

function restartMatch() {
  if (state.online) {
    if (state.isHost) startOnline();
    return;
  }
  if (localGameKind === 'tabletop') startTabletopLocal();
  else startLocal();
}

function disposeTabletopPresentation() {
  if (!tableExperimentMount) return;
  const controller = tableExperimentController;
  tableExperimentMount = null;
  tableExperimentController = null;
  controller?.dispose();
}

function renderApp() {
  const root = $('#app');
  // A vitrine não tem partida, HUD nem estado a repintar: monta uma vez e
  // vive por conta própria até a navegação sair da rota.
  if (isModelGallery) {
    if (modelGalleryMount) return;
    modelGalleryMount = import('./src/ui/model-gallery.js').then(async (module) => {
      root.innerHTML = module.modelGalleryHTML();
      return module.mountModelGallery({
        canvas: $('#gallery-canvas'),
        theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
      });
    });
    return;
  }
  const restoreChatFocus = document.activeElement?.id === 'chat-input';
  if (isTabletopLab && !state.game) resetTabletopLabScene();
  syncMusic();
  if (isTabletopLab || (state.screen === 'game' && state.presentation === '3d' && state.game)) {
    if (tableExperimentController) {
      tableExperimentController.update(state, gameViewContext());
      return;
    }
    if (!tableExperimentMount) {
      root.innerHTML = tableExperimentHTML({ testMode: isTabletopLab });
      const mount = mountTableExperiment({
        initialState: state,
        context: gameViewContext(),
        dispatch,
        requestRender: render,
        restart: restartMatch,
        sounds,
        toggleSounds: toggleGameSounds,
        toggleVoices: toggleGameVoices,
        toggleMusic: toggleGameMusic,
        sendReaction: sendTabletopReaction,
        bindChat,
        switchTo2D,
        exitTable: leaveTable,
        testMode: isTabletopLab,
        composition: isTabletopLab ? null : state.scenario,
      }).then((controller) => {
        // O jogador pode ter voltado ao 2D antes de a cena terminar de abrir.
        if (tableExperimentMount !== mount) {
          controller.dispose();
          return controller;
        }
        tableExperimentController = controller;
        controller.update(state, gameViewContext());
        if (!isTabletopLab) scheduleBots();
        return controller;
      });
      tableExperimentMount = mount;
    }
    return;
  }
  disposeTabletopPresentation();
  if (state.screen === 'lobby') {
    root.innerHTML = lobbyHTML(state) + connectionUIHTML(state) + chatPanelHTML(state);
    bindLobby();
    bindChat(restoreChatFocus);
    return;
  }
  if (state.screen === 'room' || state.screen === 'waiting_game') {
    root.innerHTML = roomHTML(state) + connectionUIHTML(state) + chatPanelHTML(state);
    bindRoom();
    bindChat(restoreChatFocus);
    return;
  }
  root.innerHTML = gameHTML(state, gameViewContext()) + connectionUIHTML(state) + chatPanelHTML(state);
  bindGame();
  bindChat(restoreChatFocus);
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
  document.querySelectorAll('[data-bot-count]').forEach(
    (button) =>
      (button.onclick = () => {
        state.botCount = normalizeLocalBotCount(button.dataset.botCount);
        render();
      }),
  );
  document.querySelectorAll('[data-scenario]').forEach(
    (button) =>
      (button.onclick = () => {
        state.scenario = button.dataset.scenario === 'council' ? 'council' : 'classic';
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

function toggleGameSounds() {
  const muted = sounds.toggle();
  if (!muted) sounds.play('action');
  render();
}

function toggleGameVoices() {
  sounds.toggleVoices();
  render();
}

function toggleGameMusic() {
  const muted = sounds.toggleMusic();
  if (!muted) startMusic();
  render();
}

function bindGame() {
  $('#leave').onclick = leaveTable;
  $('#sound-toggle')?.addEventListener('click', toggleGameSounds);
  $('#voice-toggle')?.addEventListener('click', toggleGameVoices);
  $('#music-toggle')?.addEventListener('click', toggleGameMusic);
  $('#enter-3d')?.addEventListener('click', () => {
    state.presentation = '3d';
    render();
  });
  $('#again')?.addEventListener('click', restartMatch);
  bindGameDecisionControls(document, { state, dispatch, render });
}

function bindChat(restoreFocus = false) {
  const openChat = () => {
    state.chatOpen = true;
    state.chatUnread = 0;
    render();
    $('#chat-input')?.focus();
    persistSession();
  };
  const closeChat = () => {
    state.chatOpen = false;
    render();
  };

  $('#chat-toggle')?.addEventListener('click', () => (state.chatOpen ? closeChat() : openChat()));
  $('#chat-close')?.addEventListener('click', closeChat);
  $('#chat-backdrop')?.addEventListener('click', closeChat);

  const input = $('#chat-input');
  const form = $('#chat-form');
  input?.addEventListener('input', (event) => {
    state.chatDraft = event.target.value;
    const count = Array.from(state.chatDraft).length;
    $('#chat-count').textContent = `${count}/${CHAT_MAX_LENGTH}`;
  });
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form?.requestSubmit();
    }
  });
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    state.chatDraft = input.value;
    submitChat(state.chatDraft);
    $('#chat-input')?.focus();
  });
  document.querySelectorAll('[data-taunt]').forEach((button) => {
    button.addEventListener('click', () => {
      submitChat(button.dataset.taunt, 'taunt');
      $('#chat-input')?.focus();
    });
  });

  requestAnimationFrame(() => {
    const messages = $('#chat-messages');
    if (messages) messages.scrollTop = messages.scrollHeight;
    if (restoreFocus) {
      const restoredInput = $('#chat-input');
      restoredInput?.focus();
      restoredInput?.setSelectionRange(restoredInput.value.length, restoredInput.value.length);
    }
  });
}

render();
if (resumeSnapshot && !isLabRoute(route)) connectRoom('resume');
