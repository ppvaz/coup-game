import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOST_GRACE_MS,
  createRoom,
  dispatchRoom,
  generateRoomCode,
  hostElection,
  syncRoomPresence,
} from '../src/rooms/room.js';

test('gera código curto sem caracteres ambíguos', () => {
  const code = generateRoomCode(() => 0.1);
  assert.match(code, /^[A-HJ-NP-Z2-9]{5}$/);
});

test('host controla bots e início da sala', () => {
  let room = createRoom({ code: 'ABCDE', hostId: 'host', hostName: 'Ana' });
  room = dispatchRoom(room, { type: 'add_bot', actorId: 'host', bot: { id: 'bot-1', name: 'Lorenzo' } });
  room = dispatchRoom(room, {
    type: 'start_game',
    actorId: 'host',
    game: { gameId: 'game-1', version: 1, status: 'playing' },
  });
  assert.equal(room.status, 'playing');
  assert.equal(room.activeGameId, 'game-1');
  assert.equal(room.seats[1].kind, 'bot');
});

test('aguarda o período de tolerância e migra para o humano conectado mais antigo', () => {
  let room = createRoom({ hostId: 'a', hostName: 'Ana' });
  room = dispatchRoom(room, { type: 'join', actorId: 'b', player: { id: 'b', name: 'Bia' } });
  room = dispatchRoom(room, { type: 'join', actorId: 'c', player: { id: 'c', name: 'Caio' } });
  room.seats.find((seat) => seat.id === 'b').joinedAt = 10;
  room.seats.find((seat) => seat.id === 'c').joinedAt = 20;
  room = dispatchRoom(room, { type: 'disconnect', actorId: 'a', now: 100 });
  assert.deepEqual(hostElection(room, 100 + HOST_GRACE_MS - 1), {
    status: 'waiting',
    candidateId: 'b',
    remainingMs: 1,
  });
  assert.throws(
    () => dispatchRoom(room, { type: 'promote_host', actorId: 'b', now: 100 + HOST_GRACE_MS - 1 }),
    /ainda não pode/,
  );
  room = dispatchRoom(room, { type: 'promote_host', actorId: 'b', now: 100 + HOST_GRACE_MS });
  assert.equal(room.hostId, 'b');
});

test('sincroniza quedas e retornos a partir da presença sem trocar o host', () => {
  let room = createRoom({ hostId: 'a', hostName: 'Ana' });
  room = dispatchRoom(room, { type: 'join', actorId: 'b', player: { id: 'b', name: 'Bia' } });
  room = syncRoomPresence(room, ['b'], 500);
  assert.equal(room.hostId, 'a');
  assert.equal(room.seats.find((seat) => seat.id === 'a').connected, false);
  assert.equal(room.seats.find((seat) => seat.id === 'a').disconnectedAt, 500);
  room = syncRoomPresence(room, ['a', 'b'], 800);
  assert.equal(room.seats.find((seat) => seat.id === 'a').connected, true);
  assert.equal('disconnectedAt' in room.seats.find((seat) => seat.id === 'a'), false);
  assert.equal(hostElection(room, 900).status, 'stable');
});
