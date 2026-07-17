import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, dispatchRoom, generateRoomCode } from '../src/rooms/room.js';

test('gera código curto sem caracteres ambíguos', () => {
  const code = generateRoomCode(() => 0.1);
  assert.match(code, /^[A-HJ-NP-Z2-9]{5}$/);
});

test('host controla bots e início da sala', () => {
  let room = createRoom({ code: 'ABCDE', hostId: 'host', hostName: 'Ana' });
  room = dispatchRoom(room, { type: 'add_bot', actorId: 'host', bot: { id: 'bot-1', name: 'Lorenzo' } });
  room = dispatchRoom(room, { type: 'start_game', actorId: 'host', game: { version: 1, status: 'playing' } });
  assert.equal(room.status, 'playing');
  assert.equal(room.seats[1].kind, 'bot');
});

test('migra o host para o humano conectado mais antigo', () => {
  let room = createRoom({ hostId: 'a', hostName: 'Ana' });
  room = dispatchRoom(room, { type: 'join', actorId: 'b', player: { id: 'b', name: 'Bia' } });
  room = dispatchRoom(room, { type: 'disconnect', actorId: 'a' });
  assert.equal(room.hostId, 'b');
});
