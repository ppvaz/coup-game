import { supabase, isSupabaseConfigured, supabaseConfigError } from './src/lib/supabase.js';
import { ACTIONS, createGame, dispatchGame, viewForPlayer, isAlive, responseProgress } from './src/game/coup.js';
import { reconstructGame } from './src/game/handover.js';
import { createEncryptionIdentity, decryptFrom, encryptFor } from './src/lib/secure-channel.js';
import { trackPresence } from './src/lib/realtime.js';
import { createSoundManager } from './src/lib/sounds.js';
import { botDelayMs } from './src/lib/bot-timing.js';
import { decisionClockKey } from './src/lib/decision-clock.js';
import { voiceFilesForTransition } from './src/lib/voice-announcer.js';
import { CHAT_MAX_LENGTH, appendChatMessage, createChatGuard, normalizeChatText } from './src/rooms/chat.js';
import {
  HOST_GRACE_MS,
  createRoom,
  dispatchRoom,
  generateRoomCode,
  hostElection,
  nextGameSeats,
  roomClosure,
  syncRoomPresence,
} from './src/rooms/room.js';
import { clearOnlineSession, loadOnlineSession, saveOnlineSession } from './src/rooms/session.js';
import { shouldAcceptGameView, shouldResetGame } from './src/rooms/game-sync.js';
import { canAcceptRoomSnapshot, hasRoomSeat, startJoinAttempt } from './src/rooms/join.js';
import { awaitedPlayerId, botCommand, timeoutCommand } from './src/game/ai.js';
import duquePortrait from './assets/characters/duque.png';
import assassinaPortrait from './assets/characters/assassina.png';
import capitaoPortrait from './assets/characters/capitao.png';
import embaixadoraPortrait from './assets/characters/embaixadora.png';
import condessaPortrait from './assets/characters/condessa.png';
import councilChamberDark from './assets/council-chamber.png';
import councilChamberLight from './assets/council-chamber-light.png';

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
  Embaixadora: 'Troque cartas',
  Condessa: 'Bloqueia assassinato',
};
const ACTION_ORDER = ['income', 'foreign_aid', 'tax', 'steal', 'exchange', 'assassinate', 'coup'];
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
const NAMES = ['Lorenzo', 'Beatrice', 'Vittorio'];
const CHAT_TAUNTS = [
  'A corte está observando.',
  'Isso foi um blefe.',
  'Corajoso da sua parte.',
  'Sua vez, excelência.',
];
// Relógio por fase, em segundos: estourou, a autoridade joga o padrão conservador.
const PHASE_SECONDS = {
  turn: 30,
  challenge_action: 20,
  block: 20,
  challenge_block: 20,
  choose_influence: 20,
  exchange: 30,
};

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
const resumeSnapshot = loadOnlineSession(sessionStorage, inviteCode);

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
  connection: 'idle',
  presenceReady: false,
  hostIssue: null,
  chatOpen: false,
  chatMessages: [],
  chatDraft: '',
  chatUnread: 0,
  chatError: null,
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
if (resumeSnapshot?.game) {
  clock = {
    key: 'restored',
    deadline: Date.now() + Math.max(0, resumeSnapshot.clockRemaining ?? 0),
    total: resumeSnapshot.clockTotal || 1,
  };
}

const themeToggle = $('#theme-toggle');
const sounds = createSoundManager();
const chatGuard = createChatGuard();
const unlockSounds = () => sounds.unlock().catch(() => {});
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

const me = () => state.game.players.find((player) => player.id === state.myId);
const playerName = (id) => escapeHTML(state.game.players.find((player) => player.id === id)?.name ?? '?');
const roundNumber = () => Math.floor((state.game.turn - 1) / state.game.players.length) + 1;
const sendRoom = (event, payload = {}) => roomChannel?.send({ type: 'broadcast', event, payload });

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

function timerHTML() {
  if (!clock.deadline || state.game?.status !== 'playing') return '';
  const remaining = Math.max(0, clock.deadline - Date.now());
  const seconds = Math.ceil(remaining / 1000);
  return `<div class="turn-timer ${seconds <= 5 ? 'urgent' : ''}"><em><i style="width:${(remaining / clock.total) * 100}%"></i></em><span>${seconds}s</span></div>`;
}

function scheduleBots() {
  clearTimeout(botTimer);
  if (state.online || state.game?.status !== 'playing') return;
  const awaited = awaitedPlayerId(state.game);
  const player = state.game.players.find((candidate) => candidate.id === awaited);
  if (player?.kind !== 'bot') return;
  const delay = botDelayMs();
  botTimer = setTimeout(() => applyCommand(botCommand(state.game, awaited)), delay);
}

function startLocal() {
  warnedClockKey = '';
  const seats = [
    { id: 'me', name: state.name, kind: 'human' },
    ...NAMES.map((name, index) => ({ id: `bot-${index}`, name, kind: 'bot' })),
  ];
  state.myId = 'me';
  state.game = createGame(seats, { stopWhenHumansEliminated: true });
  announceGameState(null, state.game);
  state.screen = 'game';
  resetClock();
  render();
  scheduleBots();
}

function startOnline() {
  warnedClockKey = '';
  const readySeats = nextGameSeats(state.room);
  if (readySeats.length < 2) {
    render();
    return;
  }
  const seats = readySeats.map((seat) => ({ id: seat.id, name: seat.name, kind: 'human' }));
  const gameId = crypto.randomUUID();
  state.game = createGame(seats, { gameId });
  announceGameState(null, state.game);
  state.screen = 'game';
  state.room = {
    ...state.room,
    status: 'playing',
    activeGameId: gameId,
    activePlayerIds: seats.map((seat) => seat.id),
    seats: state.room.seats.map((seat) => ({
      ...seat,
      joinsNextGame: !readySeats.some((ready) => ready.id === seat.id),
    })),
    version: state.room.version + 1,
    updatedAt: Date.now(),
  };
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

  const closure = roomClosure(state.room);
  clearHostElection();
  if (closure.status !== 'stable') {
    state.hostIssue = { status: 'closing' };
    if (closure.status === 'waiting') {
      hostElectionTimer = setTimeout(handlePresenceSync, closure.remainingMs + 30);
      render();
      persistSession();
      return;
    }
    closeTableForInsufficientPlayers();
    return;
  }

  if (handover) {
    state.hostIssue = { status: 'promoting', candidateId: state.myId, candidateName: state.name };
    render();
    return;
  }

  const election = hostElection(state.room);
  if (election.status === 'stable') {
    state.hostIssue = null;
    render();
    persistSession();
    return;
  }

  const candidate = state.room.seats.find((seat) => seat.id === election.candidateId);
  state.hostIssue = {
    status: election.status,
    candidateId: election.candidateId,
    candidateName: candidate?.name ?? 'outro jogador',
  };

  if (election.status === 'waiting') {
    hostElectionTimer = setTimeout(handlePresenceSync, election.remainingMs + 30);
  } else if (election.status === 'ready' && election.candidateId === state.myId) {
    beginHostPromotion();
    return;
  }
  render();
  persistSession();
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
  let subscribedOnce = false;
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
    .on('broadcast', { event: 'handover_request' }, ({ payload }) => replyToHandover(payload))
    .on('broadcast', { event: 'handover_response' }, ({ payload }) => collectHandover(payload))
    .on('presence', { event: 'sync' }, handlePresenceSync)
    .subscribe(async (status) => {
      if (roomChannel !== channel) return;
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        if (state.room) {
          state.connection = 'reconnecting';
        } else {
          state.error =
            'Não foi possível conectar ao Supabase. Confira a Project URL e a chave pública configuradas na Vercel.';
          state.screen = 'lobby';
          state.connection = 'idle';
        }
        render();
        return;
      }
      if (status !== 'SUBSCRIBED') return;
      const firstSubscription = !subscribedOnce;
      subscribedOnce = true;
      state.online = true;
      state.connection = kind === 'join' ? 'connecting' : 'connected';
      const presenceStatus = await trackPresence(channel, {
        playerId: state.myId,
        name: state.name,
        onlineAt: new Date().toISOString(),
        connectionId,
        publicKey: encryptionIdentity.publicKey,
      });
      if (roomChannel !== channel) return;
      if (presenceStatus === 'error') {
        state.error = 'O canal abriu, mas não foi possível registrar sua cadeira. Tente entrar novamente.';
        leaveTable();
        return;
      }
      if (!firstSubscription) {
        sendRoom('join_request', { id: state.myId, name: state.name, resume: true });
        if (state.isHost) {
          broadcastRoom();
          syncViews();
        }
        handlePresenceSync();
        render();
        persistSession();
        return;
      }
      if (kind === 'create') {
        state.room = createRoom({ code, hostId: state.myId, hostName: state.name });
        state.screen = 'room';
        history.replaceState(null, '', `/sala/${code}`);
        broadcastRoom();
        render();
      } else if (resume) {
        history.replaceState(null, '', `/sala/${code}`);
        render();
        sendRoom('join_request', { id: state.myId, name: state.name, resume: true });
        if (state.isHost) {
          broadcastRoom();
          syncViews();
        }
        handlePresenceSync();
      } else {
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
      }
      persistSession();
    });
  render();
}

function leaveTable() {
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
  state.hostIssue = null;
  state.chatOpen = false;
  state.chatMessages = [];
  state.chatDraft = '';
  state.chatUnread = 0;
  state.chatError = null;
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
      return entry.reason === 'humans_eliminated'
        ? `${n(entry.loserId)} caiu da corte. Os rivais tomaram o poder.`
        : `${n(entry.winnerId)} domina a corte.`;
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

function renderApp() {
  const root = $('#app');
  const restoreChatFocus = document.activeElement?.id === 'chat-input';
  if (state.screen === 'lobby') {
    root.innerHTML = lobbyHTML() + connectionUIHTML() + chatPanelHTML();
    bindLobby();
    bindChat(restoreChatFocus);
    return;
  }
  if (state.screen === 'room' || state.screen === 'waiting_game') {
    root.innerHTML = roomHTML() + connectionUIHTML() + chatPanelHTML();
    bindRoom();
    bindChat(restoreChatFocus);
    return;
  }
  root.innerHTML = gameHTML() + connectionUIHTML() + chatPanelHTML();
  bindGame();
  bindChat(restoreChatFocus);
}

function chatToggleHTML() {
  if (!state.online) return '';
  const unread = Math.min(state.chatUnread, 99);
  return `<button class="chat-toggle" id="chat-toggle" type="button" aria-expanded="${state.chatOpen}" aria-label="Abrir chat da mesa"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v11H9l-5 3v-14Z"/><path d="M8 10h8M8 13h5"/></svg><small>Chat</small>${unread ? `<b>${unread}</b>` : ''}</button>`;
}

function chatPanelHTML() {
  if (!state.online || !state.room || state.screen === 'lobby') return '';
  const count = Array.from(state.chatDraft).length;
  const messages = state.chatMessages.length
    ? state.chatMessages
        .map((message) => {
          const mine = message.playerId === state.myId;
          const time = new Date(message.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          return `<article class="chat-message ${mine ? 'mine' : ''} ${message.kind === 'taunt' ? 'taunt' : ''}"><span class="chat-avatar">${escapeHTML(message.playerName[0] ?? '?')}</span><div><header><strong>${escapeHTML(message.playerName || 'Convidado')}</strong><time>${time}</time></header><p>${escapeHTML(message.text)}</p></div></article>`;
        })
        .join('')
    : '<div class="chat-empty"><i>♜</i><p>A corte ainda está em silêncio.</p><small>Quebre o gelo — ou comece uma intriga.</small></div>';
  return `<div class="chat-backdrop ${state.chatOpen ? 'open' : ''}" id="chat-backdrop"></div><aside class="chat-panel ${state.chatOpen ? 'open' : ''}" aria-hidden="${!state.chatOpen}" ${state.chatOpen ? '' : 'inert'}><header class="chat-header"><div><span class="eyebrow">Conversa da mesa</span><h2>Salão da corte</h2></div><button id="chat-close" type="button" aria-label="Fechar chat">×</button></header><div class="chat-messages" id="chat-messages" aria-live="polite">${messages}</div><div class="chat-compose"><div class="chat-taunts">${CHAT_TAUNTS.map((taunt) => `<button type="button" data-taunt="${escapeHTML(taunt)}">${escapeHTML(taunt)}</button>`).join('')}</div><form id="chat-form"><textarea id="chat-input" maxlength="${CHAT_MAX_LENGTH}" rows="2" placeholder="Diga algo à corte…" ${state.connection === 'connected' ? '' : 'disabled'}>${escapeHTML(state.chatDraft)}</textarea><div class="chat-form-footer"><span class="chat-error">${escapeHTML(state.chatError ?? '')}</span><span id="chat-count">${count}/${CHAT_MAX_LENGTH}</span><button type="submit" aria-label="Enviar mensagem" ${state.connection === 'connected' ? '' : 'disabled'}>Enviar</button></div></form></div></aside>`;
}

function connectionUIHTML() {
  const offline = (state.room?.seats ?? []).filter((seat) => seat.kind === 'human' && !seat.connected);
  const banner =
    offline.length && !state.hostIssue
      ? `<div class="disconnect-banner" role="status"><i></i><span>${offline.map((seat) => escapeHTML(seat.name)).join(', ')} ${offline.length === 1 ? 'está desconectado' : 'estão desconectados'} — a mesa continua.</span></div>`
      : '';

  let overlay = '';
  if (['connecting', 'reconnecting'].includes(state.connection)) {
    const reconnecting = Boolean(state.room);
    overlay = `<div class="connection-overlay" role="alert"><div class="connection-card"><i class="connection-spinner"></i><div class="eyebrow">${reconnecting ? 'Reconectando à corte' : 'Abrindo a corte'}</div><h2>${reconnecting ? 'Sua cadeira está reservada' : 'Conectando à sala'}</h2><p>${reconnecting ? 'Recuperando a sala e sua visão da partida…' : 'Preparando um canal privado para sua mesa…'}</p></div></div>`;
  } else if (state.hostIssue) {
    const candidate = escapeHTML(state.hostIssue.candidateName ?? 'outro jogador');
    const content = {
      waiting: ['Anfitrião desconectado', `Aguardando o retorno. Se ele não voltar, ${candidate} assume a mesa.`],
      ready: ['Trocando o anfitrião', `${candidate} foi escolhido para manter a partida em andamento.`],
      promoting: ['Reconstruindo a mesa', `${candidate} está reunindo as mãos privadas e assumindo como anfitrião.`],
      failed: ['Não foi possível recuperar a mesa', 'Recarregue a página para tentar retomar sua cadeira.'],
      unavailable: ['Mesa sem jogadores conectados', 'A partida será retomada quando alguém voltar.'],
      closing: [
        'Aguardando o retorno da mesa',
        'Se nenhum outro jogador voltar durante a carência, esta mesa será encerrada.',
      ],
    }[state.hostIssue.status] ?? ['Reconectando a mesa', 'Aguarde um instante…'];
    overlay = `<div class="connection-overlay" role="alert"><div class="connection-card"><i class="connection-spinner"></i><div class="eyebrow">Continuidade da partida</div><h2>${content[0]}</h2><p>${content[1]}</p></div></div>`;
  }
  return banner + overlay;
}

function lobbyHTML() {
  return `<main class="shell"><nav class="topbar"><div class="brand">LA <span>CORTE</span></div><div class="status"><i class="dot"></i> servidor local ativo</div></nav><section class="landing"><div><div class="eyebrow">Um jogo de poder e influência</div><h1>Toda verdade<br>é um <em>risco.</em></h1><p class="lead">Blefe, negocie e elimine seus rivais. Na corte, a confiança é a moeda mais rara.</p><div class="feature-row"><div><b>2–6</b> jogadores</div><div><b>15 min</b> por partida</div><div><b>∞</b> intrigas</div></div></div><div class="glass"><h2>Entre na corte</h2><div class="sub">Escolha como deseja disputar o poder.</div><div class="mode-grid"><button class="mode ${state.mode === 'bots' ? 'active' : ''}" data-mode="bots"><span class="mode-icon">♞</span><span><strong>Contra bots</strong><small>Partida rápida contra a corte</small></span></button><button class="mode ${state.mode === 'create' ? 'active' : ''}" data-mode="create"><span class="mode-icon">♜</span><span><strong>Criar sala</strong><small>Abra uma mesa e compartilhe o código</small></span></button><button class="mode ${state.mode === 'join' ? 'active' : ''}" data-mode="join"><span class="mode-icon">⌁</span><span><strong>Entrar em sala</strong><small>Use o código enviado pelo anfitrião</small></span></button></div><div class="field"><label>Seu nome na corte</label><input id="name" maxlength="18" value="${escapeHTML(state.name)}" placeholder="Digite seu nome" /></div>${state.mode === 'join' ? `<div class="field"><label>Código da sala</label><input id="room-code" maxlength="5" value="${escapeHTML(state.joinCode || '')}" placeholder="ABCDE" autocomplete="off" /></div>` : ''}${state.error ? `<p class="form-error">${escapeHTML(state.error)}</p>` : ''}<button class="primary" id="enter">${state.mode === 'bots' ? 'Jogar contra bots' : state.mode === 'create' ? 'Criar sala privada' : 'Entrar na sala'} →</button><p class="fine">Nenhum cadastro necessário · Funciona na sua rede local</p></div></section></main>`;
}

function roomHTML() {
  const room = state.room;
  const seats = room?.seats || [];
  const self = seats.find((seat) => seat.id === state.myId);
  const connected = seats.filter((seat) => seat.connected).length;
  const lateWaiting = Boolean(self?.joinsNextGame);
  const waitingCopy = lateWaiting
    ? `<p class="waiting">${room?.status === 'finished' ? 'Aguardando a próxima partida.' : 'A partida está em andamento. Você entra na próxima.'}<small>O chat da mesa já está disponível.</small></p>`
    : '<p class="waiting">Aguardando o anfitrião distribuir as cartas…</p>';
  const startLabel = room?.status === 'finished' ? 'Iniciar próxima partida' : 'Iniciar partida';
  const roomAction =
    state.isHost && room?.status !== 'playing'
      ? `<button class="primary" id="start-room" ${connected < 2 ? 'disabled' : ''}>${startLabel}</button>`
      : state.screen === 'waiting_game' || lateWaiting
        ? waitingCopy
        : '<p class="waiting">Aguardando o anfitrião iniciar…</p>';
  return `<main class="shell"><nav class="topbar"><div class="brand">LA <span>CORTE</span></div><div class="roombar-actions">${chatToggleHTML()}<button class="ghost" id="leave-room">Sair da sala</button></div></nav><section class="room-lobby glass"><div class="eyebrow">Sala privada</div><div class="room-code">${escapeHTML(room?.code || '•••••')}</div><p class="sub">Compartilhe este link; o código já acompanha o convite.</p><button class="copy-invite" id="copy-invite">${state.shareCopied ? '✓ Link copiado' : '↗ Copiar link da sala'}</button><div class="room-seats">${seats.map((seat) => `<div class="room-seat ${seat.connected ? '' : 'offline'} ${seat.joinsNextGame ? 'next-game' : ''}"><span class="avatar">${escapeHTML(seat.name[0] ?? '?')}</span><strong title="${escapeHTML(seat.name)}">${escapeHTML(seat.name)}</strong>${seat.id === room.hostId ? '<small>ANFITRIÃO</small>' : !seat.connected ? '<small>DESCONECTADO</small>' : seat.joinsNextGame ? '<small>PRÓXIMA PARTIDA</small>' : ''}</div>`).join('')}</div>${roomAction}</section></main>`;
}

function gameHTML() {
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
    ? `<span class="next-game-count" title="${waitingPlayers} ${waitingPlayers === 1 ? 'jogador entra' : 'jogadores entram'} na próxima partida">· +${waitingPlayers} aguardando</span>`
    : '';
  const again =
    !state.online || state.isHost
      ? `<button class="primary" id="again" style="width:240px;margin-top:24px" ${state.online && readyPlayers < 2 ? 'disabled' : ''}>${state.online && readyPlayers < 2 ? 'Aguardando jogadores' : state.online ? `Jogar novamente · ${readyPlayers}` : 'Jogar novamente'}</button>`
      : '<p class="waiting">Aguardando o anfitrião abrir outra mesa…</p>';
  return `<main class="game"><nav class="gamebar"><div class="brand">LA <span>CORTE</span></div><div class="round">Sessão privada · Rodada ${roundNumber()} ${waitingNotice}</div><div class="gamebar-actions">${chatToggleHTML()}${audioTogglesHTML()}<button class="ghost" id="leave">Sair da mesa</button></div></nav><section class="board"><div class="opponents">${game.players
    .filter((player) => player.id !== state.myId)
    .map(playerHTML)
    .join(
      '',
    )}</div><div class="center"><div class="turn-copy">${finished ? result : `É a vez de<br><b>${playerName(decisionPlayerId)}</b>`}</div>${finished ? '' : timerHTML()}${historyHTML()}${finished ? again : ''}</div></section>${finished ? '' : handHTML()}${modalHTML()}</main>`;
}

function soundToggleHTML() {
  const muted = sounds.isMuted();
  return `<button class="audio-toggle sound-toggle" id="sound-toggle" type="button" aria-pressed="${muted}" aria-label="${muted ? 'Ativar efeitos sonoros' : 'Silenciar efeitos sonoros'}"><span class="audio-icon sound-icon ${muted ? 'muted' : ''}" aria-hidden="true"><svg viewBox="0 0 24 24"><path class="sound-speaker" d="M4 9h4l5-4v14l-5-4H4Z"/><path class="sound-waves" d="M16 9.2a4 4 0 0 1 0 5.6M18.5 6.8a7.3 7.3 0 0 1 0 10.4"/></svg></span><small>${muted ? 'Sons desligados' : 'Sons ligados'}</small></button>`;
}

function voiceToggleHTML() {
  const muted = sounds.isVoicesMuted();
  return `<button class="audio-toggle voice-toggle" id="voice-toggle" type="button" aria-pressed="${muted}" aria-label="${muted ? 'Ativar vozes' : 'Silenciar vozes'}"><span class="audio-icon voice-icon ${muted ? 'muted' : ''}" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="8" cy="7" r="3"/><path d="M3.5 18c.5-3.3 2.2-5 4.5-5s4 1.7 4.5 5M15 8.5a3.8 3.8 0 0 1 0 5M18 6.5a6.7 6.7 0 0 1 0 9"/></svg></span><small>${muted ? 'Vozes desligadas' : 'Vozes ligadas'}</small></button>`;
}

function audioTogglesHTML() {
  return `<div class="audio-toggles" role="group" aria-label="Controles de áudio">${soundToggleHTML()}${voiceToggleHTML()}</div>`;
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
  const isTurn = awaitedPlayerId(state.game) === player.id && state.game.status === 'playing';
  const connected = state.room?.seats.find((seat) => seat.id === player.id)?.connected ?? true;
  return `<div class="player ${isTurn ? 'turn' : ''} ${!isAlive(player) ? 'dead' : ''} ${connected ? '' : 'offline'}"><div class="avatar">${escapeHTML(player.name[0] ?? '?')}</div><strong title="${escapeHTML(player.name)}">${escapeHTML(player.name)}</strong>${connected ? '' : '<small class="offline-label">DESCONECTADO</small>'}<div class="coins">◆ ${player.coins} moedas</div><div class="influence">${player.cards.map((card) => (card.revealed ? `<i class="mini-card revealed" style="--mini-portrait:url('${PORTRAITS[card.role]}')"><span>${card.role}</span></i>` : '<i class="mini-card hidden" aria-label="Influência não revelada"><span>?</span></i>')).join('')}</div></div>`;
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

function modalAssetsHTML(playerId) {
  const player = state.game.players.find((candidate) => candidate.id === playerId);
  if (!player) return '';
  const influences = player.cards.filter((card) => !card.revealed).length;
  const coinLabel = `${player.coins} ${player.coins === 1 ? 'moeda' : 'moedas'}`;
  const influenceLabel = `${influences} ${influences === 1 ? 'influência' : 'influências'}`;
  return `<span class="modal-inline-assets">(<span class="modal-asset" title="${coinLabel}" aria-label="${coinLabel}"><i class="modal-coin-icon" aria-hidden="true">◆</i><b>${player.coins}</b></span><span aria-hidden="true">,</span><span class="modal-asset" title="${influenceLabel}" aria-label="${influenceLabel}"><svg class="modal-influence-icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="1.5" width="9" height="12"/><rect x="5.5" y="3.5" width="8" height="11"/></svg><b>${influences}</b></span>)</span>`;
}

function modalPlayerHTML(playerId) {
  return `${playerName(playerId)} ${modalAssetsHTML(playerId)}`;
}

function otherPlayersHTML(excludedIds = []) {
  const excluded = new Set(excludedIds.filter(Boolean));
  const players = state.game.players.filter((player) => !excluded.has(player.id));
  if (!players.length) return '';
  return `<div class="modal-roster"><small>Outros jogadores</small><div>${players.map((player) => `<span class="modal-roster-player ${isAlive(player) ? '' : 'eliminated'}">${modalPlayerHTML(player.id)}</span>`).join('')}</div></div>`;
}

function modalActionTargetHTML(pending) {
  return pending.targetId ? ` ${ACTIONS[pending.action].label.toLowerCase()} ${modalPlayerHTML(pending.targetId)}` : '';
}

function modalContext() {
  const events = state.game.log.slice(-3).reverse();
  const revealed = state.game.players.flatMap((player) =>
    player.cards.filter((card) => card.revealed).map((card) => card.role),
  );
  return `<aside class="modal-context"><div class="context-title">Contexto da mesa</div><div class="context-revealed"><small>REVELADAS</small><div>${revealed.length ? revealed.map((role) => `<span>${role}</span>`).join('') : '<em>Nenhuma influência revelada</em>'}</div></div><div class="context-events">${events.map((entry) => `<p>— ${describeLog(entry)}</p>`).join('')}</div></aside>`;
}

function waitingModal(title, copy) {
  return `<div class="modal-wrap"><div class="modal"><div class="eyebrow">Aguardando a mesa</div><h2>${escapeHTML(title)}</h2>${otherPlayersHTML([state.myId])}<p class="modal-copy">${escapeHTML(copy)}</p>${timerHTML()}${responseProgressHTML()}</div></div>`;
}

function responseProgressHTML() {
  if (!state.online) return '';
  const progress = responseProgress(state.game);
  if (!progress || progress.total <= 1) return '';
  const receivedLabel = progress.submitted === 1 ? 'recebida' : 'recebidas';
  const pendingLabel = progress.remaining === 1 ? 'pendente' : 'pendentes';
  const label = `${progress.submitted} ${receivedLabel}, ${progress.remaining} ${pendingLabel}`;
  return `<div class="modal-response-progress" aria-label="Progresso das respostas: ${label}"><span class="received" title="Respostas ${receivedLabel}"><i aria-hidden="true">✓</i><b>${progress.submitted}</b><small>${receivedLabel}</small></span><span class="pending" title="Respostas ${pendingLabel}"><i aria-hidden="true">◷</i><b>${progress.remaining}</b><small>${pendingLabel}</small></span></div>`;
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
  return `<div class="modal-wrap"><div class="modal"><div class="eyebrow">Escolha seu rival</div><h2>${ACTIONS[state.targetAction].label}</h2><div class="targets">${targets.map((player) => `<button class="target" data-target="${player.id}" ${state.targetAction === 'steal' && player.coins === 0 ? 'disabled' : ''}><b>${escapeHTML(player.name)}</b> ${modalAssetsHTML(player.id)}</button>`).join('')}</div><button class="ghost" id="cancel">Cancelar</button></div></div>`;
}

function challengeActionModal() {
  const pending = state.game.pending;
  const target = pending.targetId ? ` para${modalActionTargetHTML(pending)}` : '';
  return `<div class="modal-wrap"><div class="modal modal-with-context"><div class="modal-main"><div class="eyebrow">Alegação de personagem</div><h2>${modalPlayerHTML(pending.actorId)} diz ser ${pending.claimedRole}${target}</h2>${otherPlayersHTML([pending.actorId, pending.targetId])}<p class="modal-copy">Se contestar e ele provar a carta, você perde uma influência. Se for blefe, ele perde.</p>${timerHTML()}${responseProgressHTML()}<div class="response-actions"><button class="danger" id="challenge">Contestar alegação</button><button class="primary" id="allow">Permitir ação</button></div></div>${modalContext()}</div></div>`;
}

function blockChoiceModal() {
  const pending = state.game.pending;
  const roles = ACTIONS[pending.action].blockedBy;
  const intent = pending.targetId
    ? `quer${modalActionTargetHTML(pending)}`
    : `quer ${ACTIONS[pending.action].label.toLowerCase()}`;
  return `<div class="modal-wrap"><div class="modal modal-with-context"><div class="modal-main"><div class="eyebrow">Ação bloqueável</div><h2>${modalPlayerHTML(pending.actorId)} ${intent}</h2>${otherPlayersHTML([pending.actorId, pending.targetId])}<p class="modal-copy">Você pode impedir esta ação alegando uma das influências permitidas. Outros jogadores podem contestar seu bloqueio.</p>${timerHTML()}${responseProgressHTML()}<div class="card-grid">${roles.map((role) => `<button class="role-card" data-block-role="${role}" style="--portrait:url('${PORTRAITS[role]}')"><h3>${role}</h3><p>${BLOCK_HINTS[role]}</p></button>`).join('')}</div><button class="ghost" id="allow-block">Permitir ação</button></div>${modalContext()}</div></div>`;
}

function blockClaimModal() {
  const pending = state.game.pending;
  const block = pending.block;
  const eyebrow = pending.action === 'assassinate' ? 'Alvo do assassinato · Bloqueio declarado' : 'Bloqueio declarado';
  return `<div class="modal-wrap"><div class="modal modal-with-context"><div class="modal-main"><div class="eyebrow">${eyebrow}</div><h2>${modalPlayerHTML(block.playerId)} diz ser ${block.role}</h2>${otherPlayersHTML([block.playerId, pending.actorId])}<p class="modal-copy">${playerName(block.playerId)} bloqueou ${ACTIONS[pending.action].label.toLowerCase()}. Você pode aceitar ou contestar a alegação.</p>${timerHTML()}${responseProgressHTML()}<div class="response-actions"><button class="danger" id="contest-block">Contestar bloqueio</button><button class="primary" id="accept-block">Aceitar bloqueio</button></div></div>${modalContext()}</div></div>`;
}

function revealModal() {
  const options = me().cards.filter((card) => !card.revealed);
  return `<div class="modal-wrap"><div class="modal modal-with-context"><div class="modal-main"><div class="eyebrow">Influência perdida</div><h2>Escolha qual carta revelar</h2>${otherPlayersHTML([state.myId])}<p class="modal-copy">A carta escolhida fica virada para cima e deixa de valer.</p>${timerHTML()}<div class="card-grid">${options.map((card) => `<button class="role-card" data-reveal="${card.id}" style="--portrait:url('${PORTRAITS[card.role]}')"><h3>${card.role}</h3><p>${ROLE_HINTS[card.role]}</p></button>`).join('')}</div></div>${modalContext()}</div></div>`;
}

function exchangeModal() {
  const count = state.game.pending.exchangeCount;
  const picks = state.exchangePicks;
  return `<div class="modal-wrap"><div class="modal modal-with-context"><div class="modal-main"><div class="eyebrow">Troca da Embaixadora</div><h2>Escolha ${count === 1 ? 'a carta que fica' : `as ${count} cartas que ficam`}</h2>${otherPlayersHTML([state.myId])}<p class="modal-copy">As demais voltam para o baralho da corte.</p>${timerHTML()}<div class="card-grid">${state.game.exchangeOptions.map((card) => `<button class="role-card" data-pick="${card.id}" aria-pressed="${picks.includes(card.id)}" style="--portrait:url('${PORTRAITS[card.role]}')">${picks.includes(card.id) ? '<span class="pick-mark">✓</span>' : ''}<h3>${card.role}</h3><p>${ROLE_HINTS[card.role]}</p></button>`).join('')}</div><div class="response-actions"><button class="primary" id="confirm-exchange" ${picks.length === count ? '' : 'disabled'}>Confirmar troca</button></div></div>${modalContext()}</div></div>`;
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

function bindGame() {
  $('#leave').onclick = leaveTable;
  $('#sound-toggle')?.addEventListener('click', () => {
    const muted = sounds.toggle();
    if (!muted) sounds.play('action');
    render();
  });
  $('#voice-toggle')?.addEventListener('click', () => {
    sounds.toggleVoices();
    render();
  });
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
if (resumeSnapshot) connectRoom('resume');
