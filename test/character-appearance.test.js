import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARACTER_FIGURES,
  CHARACTER_GROUPS,
  DEFAULT_CHARACTER,
  characterForSeat,
  normalizeCharacter,
  randomCharacter,
  resolveCharacter,
} from '../src/lib/tabletop/coup-table/character.js';
import { ROBES } from '../src/lib/tabletop/coup-table/appearance.js';

test('normaliza entrada ausente ou inválida para o padrão', () => {
  assert.deepEqual(normalizeCharacter(null), DEFAULT_CHARACTER);
  assert.deepEqual(normalizeCharacter(42), DEFAULT_CHARACTER);
  const bad = normalizeCharacter({ figure: 'wraith', noble: { robe: 'neon' }, cultist: { hood: 'x' } });
  assert.equal(bad.figure, 'noble');
  assert.equal(bad.noble.robe, DEFAULT_CHARACTER.noble.robe);
  assert.equal(bad.cultist.hood, DEFAULT_CHARACTER.cultist.hood);
});

test('preserva os dois acervos ao escolher uma figura', () => {
  const character = normalizeCharacter({
    figure: 'cultist',
    noble: { robe: 'teal', skin: 'deep', hair: 'silver', adorno: 'sash' },
    cultist: { robe: 'abyss', hood: 'spire', face: 'ember', accent: 'cyan', relic: 'candle' },
  });
  assert.equal(character.figure, 'cultist');
  // Trocar de figura não pode apagar a customização do nobre.
  assert.equal(character.noble.robe, 'teal');
  assert.equal(character.noble.adorno, 'sash');
  assert.equal(character.cultist.hood, 'spire');
});

test('normalizar é idempotente', () => {
  const once = normalizeCharacter({ figure: 'cultist', cultist: { accent: 'gold' } });
  assert.deepEqual(normalizeCharacter(once), once);
});

test('aparência de assento é determinística e vizinhos não se repetem', () => {
  assert.deepEqual(characterForSeat(2), characterForSeat(2));
  const zero = characterForSeat(0).noble;
  const one = characterForSeat(1).noble;
  assert.notDeepEqual(zero, one);
  // sempre nobre no fallback, para preservar o visual atual da corte
  assert.equal(characterForSeat(5).figure, 'noble');
});

test('índice de assento fora da faixa não quebra', () => {
  for (const index of [-3, 0, 5, 99, Number.NaN]) {
    const character = characterForSeat(index);
    assert.equal(character.figure, 'noble');
    assert.ok(CHARACTER_GROUPS.noble.every((group) => group.key in character.noble));
  }
});

test('resolveCharacter entrega cores concretas por figura', () => {
  const noble = resolveCharacter(DEFAULT_CHARACTER);
  assert.equal(noble.figure, 'noble');
  assert.equal(typeof noble.robe, 'number');
  assert.equal(typeof noble.skin, 'number');
  assert.equal(typeof noble.hair, 'number');
  assert.equal(noble.adorno, 'none');
  // Preserva a paleta atual: o manto padrão continua sendo ROBES[0].
  assert.equal(noble.robe, ROBES[0]);

  const cultist = resolveCharacter({ figure: 'cultist', cultist: { robe: 'blood', accent: 'scarlet' } });
  assert.equal(cultist.figure, 'cultist');
  assert.equal(cultist.robe, 0x8f201b);
  assert.equal(cultist.accent, 0xff3b2f);
  assert.equal(typeof cultist.hood, 'string');
});

test('randomCharacter é sempre válido', () => {
  for (let i = 0; i < 50; i += 1) {
    const character = randomCharacter();
    assert.deepEqual(normalizeCharacter(character), character);
    assert.ok(CHARACTER_FIGURES.includes(character.figure));
  }
});

test('CHARACTER_GROUPS cobre exatamente os campos de cada figura', () => {
  const nobleKeys = CHARACTER_GROUPS.noble.map((group) => group.key).sort();
  assert.deepEqual(nobleKeys, ['adorno', 'hair', 'robe', 'skin']);
  const cultistKeys = CHARACTER_GROUPS.cultist.map((group) => group.key).sort();
  assert.deepEqual(cultistKeys, ['accent', 'face', 'hood', 'relic', 'robe']);
  for (const groups of Object.values(CHARACTER_GROUPS)) {
    for (const group of groups) {
      assert.ok(group.options.length > 0);
      for (const option of group.options) assert.ok(option.value && option.label);
    }
  }
});
