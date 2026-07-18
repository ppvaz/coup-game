import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, viewForPlayer } from '../src/game/coup.js';
import { reconstructGame } from '../src/game/handover.js';
import { HOST_GRACE_MS, createRoom, dispatchRoom, hostElection, syncRoomPresence } from '../src/rooms/room.js';

test('queda do host elege o sucessor e reconstrói um estado autoritativo jogável', () => {
  let room = createRoom({ code: 'ABCDE', hostId: 'a', hostName: 'Ana' });
  room = dispatchRoom(room, { type: 'join', actorId: 'b', player: { id: 'b', name: 'Bia' } });
  room = dispatchRoom(room, { type: 'join', actorId: 'c', player: { id: 'c', name: 'Caio' } });
  room.seats.find((seat) => seat.id === 'b').joinedAt = 10;
  room.seats.find((seat) => seat.id === 'c').joinedAt = 20;

  const game = createGame(room.seats, { gameId: 'game-1' });
  room = dispatchRoom(room, {
    type: 'start_game',
    actorId: 'a',
    gameId: game.gameId,
    playerIds: game.players.map((player) => player.id),
  });
  room = syncRoomPresence(room, ['b', 'c'], 1_000);
  assert.equal(hostElection(room, 1_000 + HOST_GRACE_MS - 1).status, 'waiting');

  room = dispatchRoom(room, {
    type: 'promote_host',
    actorId: 'b',
    now: 1_000 + HOST_GRACE_MS,
  });
  const rebuilt = reconstructGame(
    'b',
    viewForPlayer(game, 'b'),
    [{ playerId: 'c', view: viewForPlayer(game, 'c') }],
    () => 0,
  );

  assert.equal(room.hostId, 'b');
  assert.ok(rebuilt.players.flatMap((player) => player.cards).every((card) => card.role));
  assert.ok(rebuilt.deck.every((card) => card.role));
  assert.equal(rebuilt.status, 'playing');
});
