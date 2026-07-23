import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CULTIST_EXPRESSIONS, expressionForGesture } from '../src/lib/tabletop/coup-table/cultist-expressions.js';

test('todo gesto da corte mapeia para uma expressão conhecida', () => {
  for (const gesture of ['assert', 'challenge', 'block', 'prove', 'grace', 'victory', 'impact', 'defeat']) {
    assert.ok(
      CULTIST_EXPRESSIONS.includes(expressionForGesture(gesture)),
      `${gesture} deve virar uma expressão válida`,
    );
  }
});

test('desafio e bloqueio são desdém; queda e baque são choque', () => {
  assert.equal(expressionForGesture('challenge'), 'desprezo');
  assert.equal(expressionForGesture('block'), 'desprezo');
  assert.equal(expressionForGesture('impact'), 'choque');
  assert.equal(expressionForGesture('defeat'), 'choque');
});

test('vitória e reverência abrem um riso', () => {
  assert.equal(expressionForGesture('victory'), 'riso');
  assert.equal(expressionForGesture('grace'), 'riso');
});

test('sem gesto ou gesto desconhecido cai no neutro', () => {
  assert.equal(expressionForGesture(null), 'neutro');
  assert.equal(expressionForGesture('inexistente'), 'neutro');
});
