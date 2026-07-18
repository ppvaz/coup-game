import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JOIN_RETRY_MS,
  JOIN_TIMEOUT_MS,
  canAcceptRoomSnapshot,
  hasRoomSeat,
  startJoinAttempt,
} from '../src/rooms/join.js';

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

test('envia o join_request imediatamente e reenvia até ganhar a cadeira', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let sends = 0;
  let seated = false;
  startJoinAttempt({
    send: () => (sends += 1),
    isActive: () => true,
    hasSeat: () => seated,
    onTimeout: () => assert.fail('não deve expirar depois de sentar'),
  });

  assert.equal(sends, 1);
  t.mock.timers.tick(JOIN_RETRY_MS);
  assert.equal(sends, 2);
  seated = true;
  t.mock.timers.tick(JOIN_TIMEOUT_MS);
  assert.equal(sends, 2);
});

test('expira com feedback quando o anfitrião nunca responde', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let timedOut = false;
  startJoinAttempt({
    send: () => {},
    isActive: () => true,
    hasSeat: () => false,
    onTimeout: () => (timedOut = true),
  });

  t.mock.timers.tick(JOIN_TIMEOUT_MS - 1);
  assert.equal(timedOut, false);
  t.mock.timers.tick(1);
  assert.equal(timedOut, true);
});

test('para de reenviar e não expira quando o canal é trocado', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let sends = 0;
  let active = true;
  startJoinAttempt({
    send: () => (sends += 1),
    isActive: () => active,
    hasSeat: () => false,
    onTimeout: () => assert.fail('canal abandonado não expira'),
  });

  active = false;
  t.mock.timers.tick(JOIN_TIMEOUT_MS * 2);
  assert.equal(sends, 1);
});
