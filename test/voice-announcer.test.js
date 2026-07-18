import test from 'node:test';
import assert from 'node:assert/strict';
import { newLogEntries, voiceFilesForTransition } from '../src/lib/voice-announcer.js';

const state = (...log) => ({ log });
const started = { type: 'game_started', at: 1 };

test('toca a ação na declaração e não repete um estado já anunciado', () => {
  const previous = { ...state(started), phase: 'turn' };
  const next = {
    ...state(started, { type: 'action_declared', action: 'steal', actorId: 'a', at: 2 }),
    phase: 'challenge_action',
    pending: { action: 'steal' },
  };

  assert.deepEqual(
    voiceFilesForTransition(previous, next, () => 0),
    ['capitao/action-steal-01.mp3'],
  );
  assert.deepEqual(
    voiceFilesForTransition(previous, next, () => 0.99),
    ['capitao/action-steal-03.mp3'],
  );
  assert.deepEqual(voiceFilesForTransition(next, next), []);
});

test('prioriza a contestação e a comprovação conforme a chance configurada', () => {
  const previous = { ...state(started), phase: 'challenge_action', pending: { action: 'tax' } };
  const challenge = {
    type: 'challenge_resolved',
    claimedRole: 'Duque',
    truthful: true,
    at: 2,
  };
  const lost = { type: 'influence_lost', role: 'Condessa', playerId: 'b', at: 3 };

  const next = { ...state(started, challenge, lost), phase: 'choose_influence' };
  assert.deepEqual(
    voiceFilesForTransition(previous, next, () => 0),
    ['duque/challenge-received-01.mp3'],
  );
  assert.deepEqual(
    voiceFilesForTransition(previous, next, () => 0.99),
    ['duque/role-proved-01.mp3'],
  );
});

test('toca a ação na declaração e reage ao desafio quando o blefe é descoberto', () => {
  const declared = { type: 'action_declared', action: 'exchange', at: 2 };
  const previous = { ...state(started), phase: 'turn' };
  const waiting = { ...state(started, declared), phase: 'challenge_action', pending: { action: 'exchange' } };
  assert.deepEqual(
    voiceFilesForTransition(previous, waiting, () => 0),
    ['embaixadora/action-exchange-01.mp3'],
  );

  const bluff = {
    type: 'challenge_resolved',
    claimedRole: 'Embaixadora',
    truthful: false,
    at: 3,
  };
  const resolved = { ...state(started, declared, bluff), phase: 'choose_influence' };
  assert.deepEqual(
    voiceFilesForTransition(waiting, resolved, () => 0),
    ['embaixadora/challenge-received-01.mp3'],
  );
  assert.deepEqual(
    voiceFilesForTransition(waiting, resolved, () => 0.99),
    ['embaixadora/challenge-received-02.mp3'],
  );
});

test('inclui todas as novas variações de assassinato e troca', () => {
  const declared = (action, random) => {
    const previous = { ...state(started), phase: 'turn' };
    const entry = { type: 'action_declared', action, at: 2 };
    const next = { ...state(started, entry), phase: 'challenge_action', pending: { action } };
    return voiceFilesForTransition(previous, next, random);
  };

  assert.deepEqual(
    declared('assassinate', () => 0.99),
    ['assassina/action-assassinate-03.mp3'],
  );
  assert.deepEqual(
    declared('exchange', () => 0.99),
    ['embaixadora/action-exchange-05.mp3'],
  );
});

test('mapeia bloqueios e mantém sincronização quando o histórico é recortado', () => {
  const earlier = { type: 'action_declared', action: 'assassinate', at: 1 };
  const shared = { type: 'block_declared', action: 'assassinate', role: 'Condessa', at: 2 };
  const blocked = { type: 'action_blocked', action: 'assassinate', role: 'Condessa', at: 3 };

  assert.deepEqual(newLogEntries(state(earlier, shared), state(shared, blocked)), [blocked]);
  assert.deepEqual(
    voiceFilesForTransition(state(earlier), state(earlier, shared), () => 0),
    ['condessa/block-assassinate-01.mp3'],
  );
  assert.deepEqual(
    voiceFilesForTransition(state(shared), state(shared, blocked), () => 0),
    ['assassina/action-blocked-01.mp3'],
  );
});

test('alterna as falas do Duque ao bloquear ajuda externa', () => {
  const previous = state(started);
  const blocked = {
    type: 'block_declared',
    action: 'foreign_aid',
    role: 'Duque',
    at: 2,
  };

  assert.deepEqual(
    voiceFilesForTransition(previous, state(started, blocked), () => 0),
    ['duque/block-foreign-aid-01.mp3'],
  );
  assert.deepEqual(
    voiceFilesForTransition(previous, state(started, blocked), () => 0.99),
    ['duque/block-foreign-aid-02.mp3'],
  );
});

test('alterna as falas da Assassina ao perder influência', () => {
  const previous = state(started);
  const lost = { type: 'influence_lost', role: 'Assassina', at: 2 };

  assert.deepEqual(
    voiceFilesForTransition(previous, state(started, lost), () => 0),
    ['assassina/influence-lost-01.mp3'],
  );
  assert.deepEqual(
    voiceFilesForTransition(previous, state(started, lost), () => 0.99),
    ['assassina/influence-lost-03.mp3'],
  );
});

test('usa a nova comprovação da Assassina e as duas variações de bloqueio do Capitão', () => {
  const challenge = {
    type: 'challenge_resolved',
    claimedRole: 'Assassina',
    truthful: true,
    at: 2,
  };
  assert.deepEqual(
    voiceFilesForTransition(state(started), state(started, challenge), () => 0.99),
    ['assassina/role-proved-01.mp3'],
  );

  const block = { type: 'block_declared', action: 'steal', role: 'Capitão', at: 2 };
  assert.deepEqual(
    voiceFilesForTransition(state(started), state(started, block), () => 0),
    ['capitao/block-steal-01.mp3'],
  );
  assert.deepEqual(
    voiceFilesForTransition(state(started), state(started, block), () => 0.99),
    ['capitao/block-steal-02.mp3'],
  );
});
