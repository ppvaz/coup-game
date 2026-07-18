import test from 'node:test';
import assert from 'node:assert/strict';
import { canAcceptRoomSnapshot, hasRoomSeat } from '../src/rooms/join.js';

const room = {
  code: '457GC',
  seats: [{ id: 'host', name: 'Anfitrião' }],
};

test('ignora snapshots recebidos antes de o convidado ganhar uma cadeira', () => {
  assert.equal(hasRoomSeat(room, 'guest'), false);
  assert.equal(canAcceptRoomSnapshot(room, { code: '457GC', playerId: 'guest' }), false);
});

test('aceita a sala depois que o anfitrião confirma a cadeira', () => {
  const admitted = { ...room, seats: [...room.seats, { id: 'guest', name: 'Convidado' }] };

  assert.equal(hasRoomSeat(admitted, 'guest'), true);
  assert.equal(canAcceptRoomSnapshot(admitted, { code: '457GC', playerId: 'guest' }), true);
});

test('continua rejeitando snapshots de outro código', () => {
  assert.equal(canAcceptRoomSnapshot(room, { code: 'ABCDE', playerId: 'host', isHost: true }), false);
});
