import assert from 'node:assert/strict';
import test from 'node:test';
import { coinTransferDuration, coinTransferPoint, coinTransferProgress } from '../src/lib/tabletop/coin-transfer.js';

const from = { x: -2, y: 1, z: 3 };
const to = { x: 4, y: 2, z: -1 };

test('trajetória da moeda preserva origem e destino e abre um arco visível', () => {
  assert.deepEqual(coinTransferPoint(from, to, 0), from);
  assert.deepEqual(coinTransferPoint(from, to, 1), to);

  const middle = coinTransferPoint(from, to, 0.5);
  assert.ok(middle.y > Math.max(from.y, to.y));
  assert.notDeepEqual(middle, coinTransferPoint(from, to, 0.5, { index: 1 }));
});

test('movimento reduzido usa interpolação direta e curta', () => {
  assert.deepEqual(coinTransferPoint(from, to, 0.5, { reducedMotion: true }), {
    x: 1,
    y: 1.5,
    z: 1,
  });
  assert.equal(coinTransferProgress(0.09, 0, 5, { reducedMotion: true }), 0.5);
  assert.equal(coinTransferProgress(0.18, 0, 5, { reducedMotion: true }), 1);
});

test('moedas normais saem em cascata e encerram no tempo esperado', () => {
  assert.equal(coinTransferProgress(0.054, 0, 1), 0);
  assert.ok(coinTransferProgress(0.056, 0, 1) > 0);
  assert.equal(coinTransferProgress(0.83, 0, 2), 1);
  assert.equal(coinTransferDuration(3), 0.83);
  assert.equal(coinTransferDuration(7), 1.05);
  assert.equal(coinTransferDuration(7, { reducedMotion: true }), 0.18);
});
