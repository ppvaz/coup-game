import test from 'node:test';
import assert from 'node:assert/strict';
import { COINS_PER_STACK, coinStackBounds, coinStackLayout } from '../src/lib/tabletop/coin-layout.js';

test('pilhas de tesouro representam a quantidade exata de moedas', () => {
  for (const count of [0, 1, 7, 12, 30]) {
    assert.equal(coinStackLayout(count).length, count);
  }
});

test('até dez moedas ocupam cinco posições irregulares em no máximo duas camadas', () => {
  const layout = coinStackLayout(10);
  const stacks = new Map();
  for (const coin of layout) stacks.set(coin.stack, [...(stacks.get(coin.stack) ?? []), coin]);

  assert.equal(stacks.size, 5);
  assert.deepEqual(
    [...stacks.values()].map((coins) => coins.length),
    [2, 2, 2, 2, 2],
  );
  assert.deepEqual(
    stacks.get(0).map((coin) => coin.level),
    [0, 1],
  );
  assert.ok([...stacks.values()].every((coins) => coins.length <= COINS_PER_STACK));
  assert.notDeepEqual([stacks.get(0)[0].x, stacks.get(0)[0].z], [stacks.get(1)[0].x, stacks.get(1)[0].z]);
  assert.ok(new Set(stacks.get(0).map((coin) => coin.x)).size > 1);
  assert.ok(new Set(stacks.get(0).map((coin) => coin.z)).size > 1);
  assert.equal(new Set(layout.slice(0, 5).map((coin) => `${coin.x}:${coin.z}`)).size, 5);
  for (const [index, coin] of layout.slice(0, 5).entries()) {
    for (const other of layout.slice(index + 1, 5)) {
      assert.ok(Math.hypot(coin.x - other.x, coin.z - other.z) >= 0.24);
    }
  }
});

test('layout e área interativa são determinísticos e cobrem todas as pilhas', () => {
  const first = coinStackLayout(18);
  const second = coinStackLayout(18);
  const bounds = coinStackBounds(first);

  assert.deepEqual(first, second);
  assert.ok(first.every((coin) => coin.x >= bounds.centerX - bounds.width / 2));
  assert.ok(first.every((coin) => coin.x <= bounds.centerX + bounds.width / 2));
  assert.ok(first.every((coin) => coin.z >= bounds.centerZ - bounds.depth / 2));
  assert.ok(first.every((coin) => coin.z <= bounds.centerZ + bounds.depth / 2));
});

test('quantidades inválidas nunca criam moedas fantasmas', () => {
  assert.deepEqual(coinStackLayout(-3), []);
  assert.deepEqual(coinStackLayout(Number.NaN), []);
});
