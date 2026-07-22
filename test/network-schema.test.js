import assert from 'node:assert/strict';
import test from 'node:test';
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
  isRoomEnvelope,
  isRoomSnapshot,
  isStateSyncRequest,
} from '../src/rooms/network-schema.js';

const IDS = {
  host: '11111111-1111-4111-8111-111111111111',
  guest: '22222222-2222-4222-8222-222222222222',
  game: '33333333-3333-4333-8333-333333333333',
  hostConnection: '44444444-4444-4444-8444-444444444444',
  guestConnection: '55555555-5555-4555-8555-555555555555',
  request: '66666666-6666-4666-8666-666666666666',
  message: '77777777-7777-4777-8777-777777777777',
  transport: '88888888-8888-4888-8888-888888888888',
};

const publicKey = {
  key_ops: [],
  ext: true,
  kty: 'EC',
  x: 'A'.repeat(43),
  y: 'B'.repeat(43),
  crv: 'P-256',
};

const room = {
  version: 4,
  code: 'ABCDE',
  status: 'playing',
  activeGameId: IDS.game,
  activePlayerIds: [IDS.host, IDS.guest],
  hostId: IDS.host,
  maxPlayers: 6,
  seats: [
    { id: IDS.host, name: 'Ana', kind: 'human', connected: true, joinedAt: 100 },
    { id: IDS.guest, name: 'Bia', kind: 'human', connected: true, joinedAt: 200 },
  ],
  updatedAt: 300,
  game: null,
};

const encrypted = { iv: 'A'.repeat(16), data: 'A'.repeat(24) };
const privateEnvelope = {
  recipientId: IDS.guest,
  recipientConnectionId: IDS.guestConnection,
  senderId: IDS.host,
  senderConnectionId: IDS.hostConnection,
  encrypted,
};

test('aceita snapshot público coerente e rejeita relações ou limites inválidos', () => {
  assert.equal(isRoomSnapshot(room), true);
  assert.equal(isRoomEnvelope({ room, senderId: IDS.host, senderConnectionId: IDS.hostConnection }), true);
  assert.equal(
    isRoomEnvelope({ id: IDS.transport, room, senderId: IDS.host, senderConnectionId: IDS.hostConnection }),
    true,
  );

  assert.equal(isRoomSnapshot({ ...room, version: '4' }), false);
  assert.equal(isRoomSnapshot({ ...room, hostId: IDS.request }), false);
  assert.equal(isRoomSnapshot({ ...room, activePlayerIds: [IDS.host, IDS.host] }), false);
  assert.equal(isRoomSnapshot({ ...room, status: 'lobby' }), false);
  assert.equal(isRoomSnapshot({ ...room, seats: [...room.seats, { ...room.seats[0] }] }), false);
  assert.equal(
    isRoomEnvelope({ room, senderId: IDS.host, senderConnectionId: IDS.hostConnection, injected: true }),
    false,
  );
});

test('valida metadados de presença, a chave pública e a relação chave-jogador', () => {
  const presence = {
    [IDS.host]: [
      {
        playerId: IDS.host,
        name: 'Ana',
        onlineAt: '2026-07-21T12:00:00.000Z',
        connectionId: IDS.hostConnection,
        publicKey,
        presence_ref: 'ref-1',
      },
    ],
  };
  assert.equal(isPresenceState(presence), true);
  assert.equal(
    isPresenceState({
      [IDS.host]: [{ ...presence[IDS.host][0], playerId: IDS.guest }],
    }),
    false,
  );
  assert.equal(
    isPresenceState({
      [IDS.host]: [{ ...presence[IDS.host][0], publicKey: { ...publicKey, crv: 'P-384' } }],
    }),
    false,
  );
  assert.equal(
    isPresenceState({
      [IDS.host]: [{ ...presence[IDS.host][0], admin: true }],
    }),
    false,
  );
  assert.equal(isPresenceState({ [IDS.host]: [] }), false);
});

test('rejeita envelopes cifrados truncados, extensos ou com IDs inválidos', () => {
  assert.equal(isPrivateEnvelope(privateEnvelope), true);
  assert.equal(isPrivateEnvelope({ ...privateEnvelope, id: IDS.transport }), true);
  assert.equal(isPrivateEnvelope({ ...privateEnvelope, id: 'transporte-inválido' }), false);
  assert.equal(isPrivateEnvelope({ ...privateEnvelope, senderId: 'host' }), false);
  assert.equal(isPrivateEnvelope({ ...privateEnvelope, encrypted: { ...encrypted, iv: 'curto' } }), false);
  assert.equal(
    isPrivateEnvelope({ ...privateEnvelope, encrypted: { ...encrypted, data: 'A'.repeat(500_004) } }),
    false,
  );
});

test('valida pedidos de cadeira e handover antes de acessar seus campos', () => {
  const join = {
    id: IDS.guest,
    name: 'Bia',
    resume: true,
    senderId: IDS.guest,
    senderConnectionId: IDS.guestConnection,
  };
  assert.equal(isJoinRequest(join), true);
  assert.equal(isJoinRequest({ ...join, name: 'Bia\nmaliciosa' }), false);
  assert.equal(isJoinRequest({ ...join, senderId: IDS.host }), false);
  assert.equal(isJoinRequest({ ...join, extra: true }), false);

  const request = {
    requestId: IDS.request,
    successorId: IDS.guest,
    successorConnectionId: IDS.guestConnection,
    previousHostId: IDS.host,
    senderId: IDS.guest,
    senderConnectionId: IDS.guestConnection,
  };
  assert.equal(isHandoverRequest(request), true);
  assert.equal(isHandoverRequest({ ...request, id: IDS.transport }), true);
  assert.equal(isHandoverRequest({ ...request, successorId: IDS.host }), false);

  const response = {
    requestId: IDS.request,
    successorId: IDS.guest,
    successorConnectionId: IDS.guestConnection,
    playerId: IDS.host,
    senderId: IDS.host,
    senderConnectionId: IDS.hostConnection,
    encrypted,
  };
  assert.equal(isHandoverResponse(response), true);
  assert.equal(isHandoverResponse({ ...response, id: IDS.transport }), true);
  assert.equal(isHandoverResponse({ ...response, playerId: IDS.guest }), false);
});

test('valida pedidos autenticados de recuperação do estado', () => {
  const request = {
    hostId: IDS.host,
    roomVersion: 4,
    gameId: IDS.game,
    version: 7,
    refreshGame: false,
    senderId: IDS.guest,
    senderConnectionId: IDS.guestConnection,
  };
  assert.equal(isStateSyncRequest(request), true);
  assert.equal(isStateSyncRequest({ ...request, id: IDS.transport }), true);
  assert.equal(isStateSyncRequest({ ...request, gameId: null, version: 0 }), true);
  assert.equal(isStateSyncRequest({ ...request, hostId: 'host' }), false);
  assert.equal(isStateSyncRequest({ ...request, roomVersion: 0 }), false);
  assert.equal(isStateSyncRequest({ ...request, gameId: 'partida' }), false);
  assert.equal(isStateSyncRequest({ ...request, refreshGame: 'sim' }), false);
  assert.equal(isStateSyncRequest({ ...request, recipientId: IDS.host }), false);
  assert.equal(isStateSyncRequest({ ...request, roomVersion: undefined, refreshGame: undefined }), true);
});

test('valida ACK de jogada emitido pelo anfitrião e destinado à conexão exata', () => {
  const ack = {
    requestId: IDS.request,
    recipientId: IDS.guest,
    recipientConnectionId: IDS.guestConnection,
    gameId: IDS.game,
    version: 8,
    accepted: true,
    reason: 'applied',
    senderId: IDS.host,
    senderConnectionId: IDS.hostConnection,
  };
  assert.equal(isCommandAck(ack), true);
  assert.equal(isCommandAck({ ...ack, id: IDS.transport }), true);
  assert.equal(isCommandAck({ ...ack, accepted: false, reason: 'stale' }), true);
  assert.equal(isCommandAck({ ...ack, accepted: false, reason: 'applied' }), false);
  assert.equal(isCommandAck({ ...ack, accepted: true, reason: 'invalid' }), false);
  assert.equal(isCommandAck({ ...ack, recipientConnectionId: 'conexão' }), false);
  assert.equal(isCommandAck({ ...ack, extra: true }), false);
});

test('valida cada conteúdo de chat decifrado sem normalizar payload hostil', () => {
  const request = { playerId: IDS.guest, text: 'Olá, corte', kind: 'message' };
  const message = {
    id: IDS.message,
    playerId: IDS.guest,
    playerName: 'Bia',
    text: 'Olá, corte',
    sentAt: 1_000,
    kind: 'message',
  };
  assert.equal(isChatRequest(request), true);
  assert.equal(isChatRequest({ ...request, text: '  texto não normalizado  ' }), false);
  assert.equal(isChatMessageEnvelope({ message }), true);
  assert.equal(isChatMessageEnvelope({ message: { ...message, sentAt: 'agora' } }), false);
  assert.equal(isChatHistory({ messages: [message] }), true);
  assert.equal(isChatHistory({ messages: [message, message] }), false);
  assert.equal(isChatRejection({ retryAfter: 15_000 }), true);
  assert.equal(isChatRejection({ retryAfter: 60_001 }), false);
});
