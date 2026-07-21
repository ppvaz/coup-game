import { supabase, isSupabaseConfigured, supabaseConfigError } from './src/lib/supabase.js';
import { createGame, dispatchGame, viewForPlayer } from './src/game/coup.js';
import { reconstructGame } from './src/game/handover.js';
import { createEncryptionIdentity, decryptFrom, encryptFor } from './src/lib/secure-channel.js';
import { RECONNECT_GIVE_UP_MS, trackPresence } from './src/lib/realtime.js';
import { createSoundManager } from './src/lib/sounds.js';
import { consumeLabAccess } from './src/lib/lab-access.js';
import { botDelayMs } from './src/lib/bot-timing.js';
import { decisionClockKey } from './src/lib/decision-clock.js';
import { warmupPlan } from './src/lib/asset-warmup.js';
import { appendTabletopReaction } from './src/lib/tabletop/reactions.js';
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
import { shouldAcceptGameView, shouldResetGame } from './src/rooms/game-sync.js';
import { canAcceptRoomSnapshot, hasRoomSeat, startJoinAttempt } from './src/rooms/join.js';
import { createSubscriptionHandler } from './src/rooms/connection.js';
import { awaitedPlayerId, botCommand, timeoutCommand } from './src/game/ai.js';
import { mountTableExperiment, tableExperimentHTML } from './src/ui/table-experiment.js';
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

const NAMES = ['Lorenzo', 'Beatrice', 'Vittorio'];
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
const requestedTabletopLab = /^\/3d\/lab\/?$/.test(location.pathname);
if (requestedTabletopLab && !labAccess.allowed) history.replaceState(history.state, '', '/3d');
const isTabletopExperiment = /^\/3d(?:\/lab)?\/?$/.test(location.pathname);
const isTabletopLab = labAccess.allowed && /^\/3d\/lab\/?$/.test(location.pathname);
const roomPathMatch = location.pathname.match(/^\/sala\/([A-Z2-9]{5})\/?$/i);
const inviteCode = (roomPathMatch?.[1] || new URLSearchParams(location.search).get('room') || '')
  .toUpperCase()
  .replace(/[^A-Z2-9]/g, '')
  .slice(0, 5);
const resumeSnapshot = isTabletopExperiment ? null : loadOnlineSession(sessionStorage, inviteCode);

let state = {
  screen: 'lobby',
  // Apresentação da partida: o estado e as regras não mudam entre 2D e 3D.
  presentation: isTabletopExperiment ? '3d' : '2d',
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
  connection: 'idle',
  presenceReady: false,
  hostIssue: null,
  chatOpen: false,
  chatMessages: [],
  chatDraft: '',
  chatUnread: 0,
  chatError: null,
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
let botTimer = null;
let clock = { key: '', deadline: 0, total: 0 };
let hostElectionTimer = null;
let handoverTimer = null;
let handover = null;
let encryptionIdentity = null;
let connectionId = null;
let warnedClockKey = '';
let chatErrorTimer = null;
let reconnectingSince = 0;
let lastTabletopReactionAt = 0;
let tableExperimentController = null;
let tableExperimentMount = null;
// A sessão de validação de /3d senta seis cadeiras; a revanche precisa saber
// qual mesa local recriar quando a partida foi aberta pelo fluxo comum.
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
// Para ligar a trilha: ponha o arquivo em assets/music/ e troque este null por
// `import trilha from './assets/music/<arquivo>.ogg'`. Sem trilha instalada o
// controle de música nem chega a ser renderizado.
const SOUNDTRACK = null;
const gameViewContext = () => ({
  portraits: PORTRAITS,
  clock,
  soundsMuted: sounds.isMuted(),
  voicesMuted: sounds.isVoicesMuted(),
  musicAvailable: Boolean(SOUNDTRACK),
  musicMuted: sounds.isMusicMuted(),
  labAccess: labAccess.allowed,
  canSwitchTo2D: !isTabletopLab,
});
const chatGuard = createChatGuard();
const startMusic = () => sounds.playMusic(SOUNDTRACK);
// O navegador só libera áudio depois de um gesto, então a trilha começa junto
// com o desbloqueio do contexto, e não na carga da página.
const unlockSounds = () => {
  startMusic();
  return sounds.unlock().catch(() => {});
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

const sendRoom = (event, payload = {}) => roomChannel?.send({ type: 'broadcast', event, payload });

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
  const recipients = roomChannel?.presenceState()?.[recipientId] ?? [];
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
  if (!encryptionIdentity || payload?.recipientId !== state.myId || payload.recipientConnectionId !== connectionId)
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
    sendRoom('command', { playerId: state.myId, command });
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
    return;
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
}

function presenceEntry(playerId, targetConnectionId) {
  const entries = roomChannel?.presenceState()?.[playerId] ?? [];
  return targetConnectionId ? entries.find((entry) => entry.connectionId === targetConnectionId) : entries.at(-1);
}

async function syncViews() {
  if (!state.online || !state.isHost || !state.game || !encryptionIdentity) return;
  const sends = [];
  for (const player of state.game.players.filter((candidate) => candidate.id !== state.myId)) {
    for (const recipient of roomChannel?.presenceState()?.[player.id] ?? []) {
      if (!recipient.publicKey || !recipient.connectionId) continue;
      const view = viewForPlayer(state.game, player.id);
      view.log = view.log.slice(-20);
      // Restante em ms, não timestamp: o relógio do convidado pode divergir do host.
      view.clockRemaining = clock.deadline - Date.now();
      view.clockTotal = clock.total;
      sends.push(
        encryptFor(encryptionIdentity, recipient.publicKey, view).then((encrypted) =>
          sendRoom('game_state', {
            recipientId: player.id,
            recipientConnectionId: recipient.connectionId,
            senderId: state.myId,
            senderConnectionId: connectionId,
            encrypted,
          }),
        ),
      );
    }
  }
  await Promise.allSettled(sends);
  persistSession();
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
  if (state.online && !state.isHost) return; // o host aplica pelo ausente
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
  const connectedIds = roomChannel ? Object.keys(roomChannel.presenceState()) : [];
  if (state.hostIssue || presenceDiverges(state.room, connectedIds)) handlePresenceSync();
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
  const seats = [
    { id: 'me', name: state.name, kind: 'human' },
    ...NAMES.map((name, index) => ({ id: `bot-${index}`, name, kind: 'bot' })),
  ];
  state.myId = 'me';
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
  sendRoom('game_started', { gameId });
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

function handlePresenceSync() {
  if (!roomChannel || !state.room || !state.online) return;
  const connectedIds = Object.keys(roomChannel.presenceState());
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
  sendRoom('handover_request', {
    requestId: handover.id,
    successorId: state.myId,
    successorConnectionId: connectionId,
    previousHostId,
  });
  clearTimeout(handoverTimer);
  handoverTimer = setTimeout(finishHostPromotion, 1_400);
  render();
}

function finishHostPromotion() {
  clearTimeout(handoverTimer);
  handoverTimer = null;
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
  sendRoom('host_changed', { room: publicRoom() });
  broadcastRoom();
  render();
  syncViews();
  persistSession();
}

async function replyToHandover(payload) {
  if (
    !payload?.requestId ||
    !payload.successorId ||
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
  const encrypted = await encryptFor(encryptionIdentity, successor.publicKey, state.game);
  sendRoom('handover_response', {
    requestId: payload.requestId,
    successorId: payload.successorId,
    successorConnectionId: payload.successorConnectionId,
    playerId: state.myId,
    senderConnectionId: connectionId,
    encrypted,
  });
}

async function collectHandover(payload) {
  if (
    !handover ||
    payload?.requestId !== handover.id ||
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
    handover?.responses.set(payload.playerId, view);
  } catch {
    // Resposta corrompida ou destinada a outra eleição: é ignorada.
  }
}

async function connectRoom(kind) {
  if (!isSupabaseConfigured) {
    state.error =
      supabaseConfigError ||
      'Multiplayer online ainda não foi configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.';
    render();
    return;
  }
  const resume = kind === 'resume';
  state.error = null;
  state.connection = 'connecting';
  reconnectingSince = 0;
  state.presenceReady = false;
  roomChannel?.unsubscribe();
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
  if (!resume) {
    state.myId = crypto.randomUUID();
    state.isHost = kind === 'create';
    state.chatMessages = [];
    state.chatDraft = '';
    state.chatUnread = 0;
    state.chatError = null;
  }
  const code = kind === 'create' ? generateRoomCode() : state.room?.code || state.joinCode;
  const channel = supabase.channel(`la-corte:${code}`, {
    config: { broadcast: { self: false }, presence: { key: state.myId, enabled: true } },
  });
  roomChannel = channel
    .on('broadcast', { event: 'join_request' }, ({ payload }) => {
      if (!state.isHost || !state.room) return;
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
    .on('broadcast', { event: 'room' }, ({ payload }) => {
      if (acceptRoom(payload.room)) render();
    })
    .on('broadcast', { event: 'host_changed' }, ({ payload }) => {
      if (!acceptRoom(payload.room)) return;
      handover = null;
      clearTimeout(handoverTimer);
      state.hostIssue = null;
      state.connection = 'connected';
      render();
    })
    .on('broadcast', { event: 'game_started' }, ({ payload }) => {
      if (state.isHost) return;
      warnedClockKey = '';
      if (payload?.gameId) state.room = { ...state.room, status: 'playing', activeGameId: payload.gameId };
      if (shouldResetGame(state.game, payload?.gameId)) state.game = null;
      state.targetAction = null;
      state.exchangePicks = [];
      clock = { key: '', deadline: 0, total: 0 };
      state.screen = 'waiting_game';
      persistSession();
      render();
    })
    .on('broadcast', { event: 'game_state' }, async ({ payload }) => {
      if (state.isHost) return;
      if (
        payload?.recipientId !== state.myId ||
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
      if (!shouldAcceptGameView(state.game, view, state.room?.activeGameId)) return;
      const previous = state.game;
      state.game = view;
      announceGameState(previous, view);
      state.screen = 'game';
      state.connection = 'connected';
      clock = {
        key: decisionClockKey(view),
        deadline: Date.now() + Math.max(0, view.clockRemaining ?? 0),
        total: view.clockTotal || 1,
      };
      persistSession();
      render();
    })
    .on('broadcast', { event: 'command' }, ({ payload }) => {
      if (!state.isHost || !state.game) return;
      if (!payload?.command || payload.command.actorId !== payload.playerId) return;
      applyCommand(payload.command);
    })
    .on('broadcast', { event: 'chat_request' }, async ({ payload }) => {
      if (!state.isHost) return;
      const request = await readPrivateChat(payload);
      if (!request || request.playerId !== payload.senderId) return;
      acceptChatRequest(request);
    })
    .on('broadcast', { event: 'chat_message' }, async ({ payload }) => {
      if (payload?.senderId !== state.room?.hostId) return;
      const accepted = await readPrivateChat(payload);
      if (accepted?.message && addChatMessage(accepted.message)) render();
    })
    .on('broadcast', { event: 'chat_history' }, async ({ payload }) => {
      if (state.isHost || payload?.senderId !== state.room?.hostId) return;
      const history = await readPrivateChat(payload);
      if (!history) return;
      const merged = [...(history.messages ?? []), ...state.chatMessages].sort(
        (left, right) => left.sentAt - right.sentAt,
      );
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
      if (!rejection) return;
      const retryAfter = Math.max(1_000, Number(rejection.retryAfter) || 1_000);
      setChatError(`Muitas mensagens. Aguarde ${Math.ceil(retryAfter / 1000)}s para continuar.`, retryAfter);
      render();
    })
    .on('broadcast', { event: 'tabletop_reaction' }, ({ payload }) => {
      if (payload?.senderId !== payload?.playerId || !hasRoomSeat(state.room, payload.playerId)) return;
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
          },
          beginJoin() {
            // A rede é agendada antes do primeiro render: se a UI lançar, o
            // join_request e o timeout continuam valendo (regressão DM9HH).
            startJoinAttempt({
              isActive: () => roomChannel === channel,
              hasSeat: () => hasRoomSeat(state.room, state.myId),
              send: () =>
                channel
                  .send({
                    type: 'broadcast',
                    event: 'join_request',
                    payload: { id: state.myId, name: state.name },
                  })
                  .catch(() => {}),
              onTimeout: () => {
                roomChannel = null;
                connectionId = null;
                encryptionIdentity = null;
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
  state.presentation = '2d';
  clearTimeout(botTimer);
  clearHostElection();
  clearTimeout(handoverTimer);
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
  state.tabletopReactions = [];
  clearOnlineSession(sessionStorage);
  const channel = roomChannel;
  roomChannel = null;
  connectionId = null;
  encryptionIdentity = null;
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
  const restoreChatFocus = document.activeElement?.id === 'chat-input';
  if (isTabletopLab && !state.game) resetTabletopLabScene();
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

if (isTabletopExperiment && !isTabletopLab) startTabletopLocal();
else render();
if (resumeSnapshot && !isTabletopExperiment) connectRoom('resume');
