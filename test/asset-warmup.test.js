import test from 'node:test';
import assert from 'node:assert/strict';
import { warmupPlan } from '../src/lib/asset-warmup.js';

const chambers = { dark: 'noite.png', light: 'dia.png' };
const portraits = { Duque: 'duque.png', Condessa: 'condessa.png' };

test('pré-carrega imediatamente apenas o cenário do tema ativo', () => {
  assert.deepEqual(warmupPlan({ theme: 'light', chambers, portraits }).immediate, ['dia.png']);
  assert.deepEqual(warmupPlan({ theme: 'dark', chambers, portraits }).immediate, ['noite.png']);
  assert.deepEqual(warmupPlan({ theme: undefined, chambers, portraits }).immediate, ['noite.png']);
});

test('retratos aquecem em tempo ocioso, antes de qualquer partida', () => {
  const plan = warmupPlan({ theme: 'dark', chambers, portraits });
  assert.deepEqual(plan.idle, ['duque.png', 'condessa.png']);
  assert.ok(!plan.immediate.includes('duque.png'));
});
