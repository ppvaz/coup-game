import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TABLETOP_THROWABLES,
  appendTabletopReaction,
  isTabletopReactionEnvelope,
  normalizeTabletopReaction,
} from '../src/lib/tabletop/reactions.js';

const players = { playerIds: ['a', 'b', 'c'] };

test('aceita emojis conhecidos e arremessos entre jogadores distintos', () => {
  assert.deepEqual(
    normalizeTabletopReaction({ id: 'r1', kind: 'emoji', playerId: 'a', emoji: '👏', sentAt: 10 }, players),
    { id: 'r1', kind: 'emoji', playerId: 'a', emoji: '👏', sentAt: 10 },
  );
  assert.deepEqual(
    normalizeTabletopReaction(
      { id: 'r2', kind: 'throw', playerId: 'a', targetId: 'b', throwable: 'tomato', sentAt: 11 },
      players,
    ),
    { id: 'r2', kind: 'throw', playerId: 'a', targetId: 'b', throwable: 'tomato', sentAt: 11 },
  );
  assert.deepEqual(
    normalizeTabletopReaction(
      { id: 'r3', kind: 'throw', playerId: 'b', targetId: 'c', throwable: 'assassin_dagger', sentAt: 12 },
      players,
    ),
    { id: 'r3', kind: 'throw', playerId: 'b', targetId: 'c', throwable: 'assassin_dagger', sentAt: 12 },
  );
});

test('rejeita conteúdo arbitrário, alvo inválido e autoarremesso', () => {
  assert.equal(
    normalizeTabletopReaction({ id: 'r1', kind: 'emoji', playerId: 'a', emoji: '<script>', sentAt: 10 }, players),
    null,
  );
  assert.equal(
    normalizeTabletopReaction(
      { id: 'r2', kind: 'throw', playerId: 'a', targetId: 'x', throwable: 'rose', sentAt: 10 },
      players,
    ),
    null,
  );
  assert.equal(
    normalizeTabletopReaction(
      { id: 'r3', kind: 'throw', playerId: 'a', targetId: 'a', throwable: 'glove', sentAt: 10 },
      players,
    ),
    null,
  );
});

test('ignora duplicatas e limita o histórico efêmero', () => {
  let reactions = [];
  for (let index = 0; index < 30; index += 1) {
    reactions = appendTabletopReaction(
      reactions,
      { id: `r${index}`, kind: 'emoji', playerId: 'a', emoji: '👀', sentAt: index + 1 },
      players,
    );
  }
  assert.equal(reactions.length, 24);
  assert.equal(reactions[0].id, 'r6');
  assert.equal(appendTabletopReaction(reactions, reactions.at(-1), players), reactions);
});

test('a ampulheta é arremessável como os demais adereços da corte', () => {
  assert.deepEqual(
    normalizeTabletopReaction(
      { id: 'r1', kind: 'throw', playerId: 'a', targetId: 'b', throwable: 'hourglass', sentAt: 10 },
      players,
    ),
    { id: 'r1', kind: 'throw', playerId: 'a', targetId: 'b', throwable: 'hourglass', sentAt: 10 },
  );
  assert.ok(
    TABLETOP_THROWABLES.some((item) => item.id === 'hourglass'),
    'o painel de reações oferece a ampulheta',
  );
});

test('envelope de rede exige UUIDs, remetente vinculado e somente campos conhecidos', () => {
  const ana = '11111111-1111-4111-8111-111111111111';
  const bia = '22222222-2222-4222-8222-222222222222';
  const reaction = {
    id: '33333333-3333-4333-8333-333333333333',
    kind: 'throw',
    playerId: ana,
    targetId: bia,
    throwable: 'tomato',
    sentAt: 10,
    senderId: ana,
    senderConnectionId: '44444444-4444-4444-8444-444444444444',
  };
  const onlinePlayers = { playerIds: [ana, bia] };
  assert.equal(isTabletopReactionEnvelope(reaction, onlinePlayers), true);
  assert.equal(isTabletopReactionEnvelope({ ...reaction, senderId: bia }, onlinePlayers), false);
  assert.equal(isTabletopReactionEnvelope({ ...reaction, id: 'curto' }, onlinePlayers), false);
  assert.equal(isTabletopReactionEnvelope({ ...reaction, html: '<script>' }, onlinePlayers), false);
});
