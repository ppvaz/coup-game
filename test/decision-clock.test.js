import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionClockKey } from '../src/lib/decision-clock.js';

test('preserva o mesmo relógio durante as respostas coletivas', () => {
  const first = {
    turn: 3,
    phase: 'challenge_action',
    responseQueue: ['b', 'c', 'd'],
  };
  const afterPass = { ...first, responseQueue: ['c', 'd'] };

  assert.equal(decisionClockKey(first), decisionClockKey(afterPass));
});

test('abre um novo relógio ao mudar de fase ou de turno', () => {
  const challenge = { turn: 3, phase: 'challenge_action' };
  const block = { turn: 3, phase: 'block' };
  const nextTurn = { turn: 4, phase: 'turn' };

  assert.notEqual(decisionClockKey(challenge), decisionClockKey(block));
  assert.notEqual(decisionClockKey(block), decisionClockKey(nextTurn));
});
