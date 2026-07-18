import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOST_GRACE_MS,
  createRoom,
  dispatchRoom,
  generateRoomCode,
  hostElection,
  nextGameSeats,
  roomClosure,
  syncRoomPresence,
} from '../src/rooms/room.js';

test('gera código curto sem caracteres ambíguos', () => {
  const code = generateRoomCode(() => 0.1);
  assert.match(code, /^[A-HJ-NP-Z2-9]{5}$/);
});

test('somente o anfitrião inicia, e apenas com a mesa fora de jogo', () => {
  let room = createRoom({ code: 'ABCDE', hostId: 'host', hostName: 'Ana' });
  room = dispatchRoom(room, { type: 'join', actorId: 'bia', player: { id: 'bia', name: 'Bia' } });

  assert.throws(
    () => dispatchRoom(room, { type: 'start_game', actorId: 'bia', gameId: 'g', playerIds: ['host', 'bia'] }),
    /anfitrião/,
  );
  room = dispatchRoom(room, { type: 'start_game', actorId: 'host', gameId: 'game-1', playerIds: ['host', 'bia'] });
  assert.equal(room.status, 'playing');
  assert.equal(room.activeGameId, 'game-1');
  assert.throws(
    () => dispatchRoom(room, { type: 'start_game', actorId: 'host', gameId: 'game-2', playerIds: ['host', 'bia'] }),
    /andamento/,
  );

  // Fim de partida reabre a mesa para a próxima.
  room = { ...room, status: 'finished' };
  room = dispatchRoom(room, { type: 'start_game', actorId: 'host', gameId: 'game-2', playerIds: ['host', 'bia'] });
  assert.equal(room.activeGameId, 'game-2');
});

test('aguarda o período de tolerância e migra para o humano conectado mais antigo', () => {
  let room = createRoom({ hostId: 'a', hostName: 'Ana' });
  room = dispatchRoom(room, { type: 'join', actorId: 'b', player: { id: 'b', name: 'Bia' } });
  room = dispatchRoom(room, { type: 'join', actorId: 'c', player: { id: 'c', name: 'Caio' } });
  room.seats.find((seat) => seat.id === 'b').joinedAt = 10;
  room.seats.find((seat) => seat.id === 'c').joinedAt = 20;
  room = syncRoomPresence(room, ['b', 'c'], 100);
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

test('encerra a mesa quando sobra um jogador após a carência de todos os demais', () => {
  let room = createRoom({ hostId: 'a', hostName: 'Ana' });
  assert.equal(roomClosure(room, 50_000).status, 'stable');

  room = dispatchRoom(room, { type: 'join', actorId: 'b', player: { id: 'b', name: 'Bia' } });
  room = dispatchRoom(room, { type: 'join', actorId: 'c', player: { id: 'c', name: 'Caio' } });
  room = syncRoomPresence(room, ['a', 'c'], 1_000);
  room = syncRoomPresence(room, ['a'], 1_300);

  assert.deepEqual(roomClosure(room, 1_000 + HOST_GRACE_MS), {
    status: 'waiting',
    survivorId: 'a',
    remainingMs: 300,
  });
  assert.deepEqual(roomClosure(room, 1_300 + HOST_GRACE_MS), {
    status: 'ready',
    survivorId: 'a',
    remainingMs: 0,
  });
});

test('cancela o encerramento se outro jogador retornar durante a carência', () => {
  let room = createRoom({ hostId: 'a', hostName: 'Ana' });
  room = dispatchRoom(room, { type: 'join', actorId: 'b', player: { id: 'b', name: 'Bia' } });
  room = syncRoomPresence(room, ['a'], 1_000);
  assert.equal(roomClosure(room, 1_000 + HOST_GRACE_MS - 1).status, 'waiting');

  room = syncRoomPresence(room, ['a', 'b'], 1_500);
  assert.equal(roomClosure(room, 1_000 + HOST_GRACE_MS).status, 'stable');
});

test('entrada tardia aguarda a próxima partida e participa da sala', () => {
  let room = createRoom({ code: 'ABCDE', hostId: 'host', hostName: 'Ana' });
  room = dispatchRoom(room, { type: 'join', actorId: 'bia', player: { id: 'bia', name: 'Bia' } });
  room = dispatchRoom(room, { type: 'start_game', actorId: 'host', gameId: 'game-1', playerIds: ['host', 'bia'] });
  room = dispatchRoom(room, { type: 'join', actorId: 'caio', player: { id: 'caio', name: 'Caio' } });

  const late = room.seats.find((seat) => seat.id === 'caio');
  assert.equal(late.connected, true);
  assert.equal(late.joinsNextGame, true);
  assert.deepEqual(room.activePlayerIds, ['host', 'bia']);
  assert.deepEqual(
    nextGameSeats(room).map((seat) => seat.id),
    ['host', 'bia', 'caio'],
  );
});

test('jogador tardio só pode assumir a sala depois do fim da partida', () => {
  let room = createRoom({ code: 'ABCDE', hostId: 'host', hostName: 'Ana' });
  room = dispatchRoom(room, { type: 'join', actorId: 'bia', player: { id: 'bia', name: 'Bia' } });
  room = dispatchRoom(room, { type: 'start_game', actorId: 'host', gameId: 'game-1', playerIds: ['host', 'bia'] });
  room = dispatchRoom(room, { type: 'join', actorId: 'caio', player: { id: 'caio', name: 'Caio' } });
  room = dispatchRoom(room, { type: 'join', actorId: 'davi', player: { id: 'davi', name: 'Davi' } });
  room = syncRoomPresence(room, ['caio', 'davi'], 1_000);

  assert.equal(hostElection(room, 1_000 + HOST_GRACE_MS).status, 'unavailable');
  assert.equal(roomClosure(room, 1_000 + HOST_GRACE_MS).status, 'stable');

  room.status = 'finished';
  assert.deepEqual(hostElection(room, 1_000 + HOST_GRACE_MS), {
    status: 'ready',
    candidateId: 'caio',
    remainingMs: 0,
  });
});

test('nova partida ignora assentos desconectados', () => {
  let room = createRoom({ code: 'ABCDE', hostId: 'host', hostName: 'Ana' });
  room = dispatchRoom(room, { type: 'join', actorId: 'bia', player: { id: 'bia', name: 'Bia' } });
  room = dispatchRoom(room, { type: 'join', actorId: 'caio', player: { id: 'caio', name: 'Caio' } });
  room = syncRoomPresence(room, ['host', 'caio'], 500);

  assert.deepEqual(
    nextGameSeats(room).map((seat) => seat.id),
    ['host', 'caio'],
  );
});
