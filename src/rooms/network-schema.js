import { CHAT_HISTORY_LIMIT, CHAT_MAX_LENGTH, normalizeChatText } from './chat.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{5}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BASE64URL_256_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_ENCRYPTED_LENGTH = 500_000;
const MAX_PRESENCE_PLAYERS = 24;
const MAX_CONNECTIONS_PER_PLAYER = 4;

export const isRecord = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

export const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);

const isSafeInteger = (value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= minimum && value <= maximum;

const hasOnlyKeys = (value, allowed) => Object.keys(value).every((key) => allowed.includes(key));

const isBoundedText = (value, maximum, { empty = false } = {}) => {
  if (typeof value !== 'string' || Array.from(value).length > maximum) return false;
  if (!empty && !value.trim()) return false;
  return !Array.from(value).some((character) => {
    const point = character.codePointAt(0);
    return point < 32 || point === 127;
  });
};

export const isPlayerName = (value) => isBoundedText(value, 18);

const isSeat = (value) =>
  isRecord(value) &&
  hasOnlyKeys(value, ['id', 'name', 'kind', 'connected', 'joinedAt', 'joinsNextGame', 'disconnectedAt']) &&
  isUuid(value.id) &&
  isPlayerName(value.name) &&
  value.kind === 'human' &&
  typeof value.connected === 'boolean' &&
  isSafeInteger(value.joinedAt) &&
  (value.joinsNextGame === undefined || typeof value.joinsNextGame === 'boolean') &&
  (value.connected
    ? value.disconnectedAt === undefined
    : isSafeInteger(value.disconnectedAt) && value.disconnectedAt >= value.joinedAt);

export function isRoomSnapshot(value) {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'version',
      'code',
      'status',
      'activeGameId',
      'activePlayerIds',
      'hostId',
      'maxPlayers',
      'seats',
      'updatedAt',
      'game',
    ]) ||
    !isSafeInteger(value.version, 1) ||
    typeof value.code !== 'string' ||
    !ROOM_CODE_PATTERN.test(value.code) ||
    !['lobby', 'playing', 'finished'].includes(value.status) ||
    !isSafeInteger(value.maxPlayers, 2, 6) ||
    !Array.isArray(value.seats) ||
    value.seats.length < 1 ||
    value.seats.length > value.maxPlayers ||
    !value.seats.every(isSeat) ||
    !isSafeInteger(value.updatedAt) ||
    (value.game !== undefined && value.game !== null)
  )
    return false;

  const seatIds = value.seats.map((seat) => seat.id);
  const uniqueSeatIds = new Set(seatIds);
  if (uniqueSeatIds.size !== seatIds.length || !uniqueSeatIds.has(value.hostId)) return false;
  if (!Array.isArray(value.activePlayerIds) || value.activePlayerIds.length > value.maxPlayers) return false;
  if (
    value.activePlayerIds.some((id) => !isUuid(id) || !uniqueSeatIds.has(id)) ||
    new Set(value.activePlayerIds).size !== value.activePlayerIds.length
  )
    return false;

  if (value.status === 'lobby') return value.activeGameId === null && value.activePlayerIds.length === 0;
  return isUuid(value.activeGameId) && value.activePlayerIds.length >= 2;
}

export function isPublicKey(value) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['key_ops', 'ext', 'kty', 'x', 'y', 'crv']) &&
    Array.isArray(value.key_ops) &&
    value.key_ops.length === 0 &&
    value.ext === true &&
    value.kty === 'EC' &&
    value.crv === 'P-256' &&
    typeof value.x === 'string' &&
    BASE64URL_256_PATTERN.test(value.x) &&
    typeof value.y === 'string' &&
    BASE64URL_256_PATTERN.test(value.y)
  );
}

export function isPresenceEntry(value, expectedPlayerId) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['playerId', 'name', 'onlineAt', 'connectionId', 'publicKey', 'presence_ref']) &&
    isUuid(value.playerId) &&
    value.playerId === expectedPlayerId &&
    isPlayerName(value.name) &&
    typeof value.onlineAt === 'string' &&
    value.onlineAt.length <= 40 &&
    Number.isFinite(Date.parse(value.onlineAt)) &&
    isUuid(value.connectionId) &&
    isPublicKey(value.publicKey) &&
    (value.presence_ref === undefined || isBoundedText(value.presence_ref, 160))
  );
}

export function isPresenceState(value) {
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= MAX_PRESENCE_PLAYERS &&
    entries.every(
      ([playerId, presences]) =>
        isUuid(playerId) &&
        Array.isArray(presences) &&
        presences.length >= 1 &&
        presences.length <= MAX_CONNECTIONS_PER_PLAYER &&
        presences.every((presence) => isPresenceEntry(presence, playerId)) &&
        new Set(presences.map((presence) => presence.connectionId)).size === presences.length,
    )
  );
}

export function isEncryptedValue(value) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['iv', 'data']) &&
    typeof value.iv === 'string' &&
    value.iv.length === 16 &&
    BASE64_PATTERN.test(value.iv) &&
    typeof value.data === 'string' &&
    value.data.length >= 24 &&
    value.data.length <= MAX_ENCRYPTED_LENGTH &&
    value.data.length % 4 === 0 &&
    BASE64_PATTERN.test(value.data)
  );
}

export function isPrivateEnvelope(value) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['id', 'recipientId', 'recipientConnectionId', 'senderId', 'senderConnectionId', 'encrypted']) &&
    (value.id === undefined || isUuid(value.id)) &&
    isUuid(value.recipientId) &&
    isUuid(value.recipientConnectionId) &&
    isUuid(value.senderId) &&
    isUuid(value.senderConnectionId) &&
    isEncryptedValue(value.encrypted)
  );
}

export function isJoinRequest(value) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['id', 'name', 'resume', 'senderId', 'senderConnectionId']) &&
    isUuid(value.id) &&
    value.id === value.senderId &&
    isUuid(value.senderConnectionId) &&
    isPlayerName(value.name) &&
    (value.resume === undefined || typeof value.resume === 'boolean')
  );
}

export const isRoomEnvelope = (value) =>
  isRecord(value) &&
  hasOnlyKeys(value, ['id', 'room', 'senderId', 'senderConnectionId']) &&
  (value.id === undefined || isUuid(value.id)) &&
  isUuid(value.senderId) &&
  isUuid(value.senderConnectionId) &&
  isRoomSnapshot(value.room);

export function isHandoverRequest(value) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'id',
      'requestId',
      'successorId',
      'successorConnectionId',
      'previousHostId',
      'senderId',
      'senderConnectionId',
    ]) &&
    (value.id === undefined || isUuid(value.id)) &&
    isUuid(value.requestId) &&
    isUuid(value.successorId) &&
    isUuid(value.successorConnectionId) &&
    isUuid(value.previousHostId) &&
    value.senderId === value.successorId &&
    value.senderConnectionId === value.successorConnectionId &&
    value.successorId !== value.previousHostId
  );
}

export function isHandoverResponse(value) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      'id',
      'requestId',
      'successorId',
      'successorConnectionId',
      'playerId',
      'senderId',
      'senderConnectionId',
      'encrypted',
    ]) &&
    (value.id === undefined || isUuid(value.id)) &&
    isUuid(value.requestId) &&
    isUuid(value.successorId) &&
    isUuid(value.successorConnectionId) &&
    isUuid(value.playerId) &&
    value.senderId === value.playerId &&
    isUuid(value.senderConnectionId) &&
    value.playerId !== value.successorId &&
    isEncryptedValue(value.encrypted)
  );
}

const isChatKind = (value) => value === 'message' || value === 'taunt';

export function isChatRequest(value) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['playerId', 'text', 'kind']) &&
    isUuid(value.playerId) &&
    typeof value.text === 'string' &&
    value.text === normalizeChatText(value.text) &&
    Array.from(value.text).length <= CHAT_MAX_LENGTH &&
    isChatKind(value.kind)
  );
}

export function isChatMessage(value) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['id', 'playerId', 'playerName', 'text', 'sentAt', 'kind']) &&
    isUuid(value.id) &&
    isUuid(value.playerId) &&
    isPlayerName(value.playerName) &&
    typeof value.text === 'string' &&
    value.text === normalizeChatText(value.text) &&
    Array.from(value.text).length <= CHAT_MAX_LENGTH &&
    isSafeInteger(value.sentAt) &&
    isChatKind(value.kind)
  );
}

export const isChatMessageEnvelope = (value) =>
  isRecord(value) && hasOnlyKeys(value, ['message']) && isChatMessage(value.message);

export const isChatHistory = (value) =>
  isRecord(value) &&
  hasOnlyKeys(value, ['messages']) &&
  Array.isArray(value.messages) &&
  value.messages.length <= CHAT_HISTORY_LIMIT &&
  value.messages.every(isChatMessage) &&
  new Set(value.messages.map((message) => message.id)).size === value.messages.length;

export const isChatRejection = (value) =>
  isRecord(value) && hasOnlyKeys(value, ['retryAfter']) && isSafeInteger(value.retryAfter, 1_000, 60_000);
