import test from 'node:test';
import assert from 'node:assert/strict';
import { NOBLE_SKINS, ROBES, nobleAppearance } from '../src/lib/tabletop/coup-table/appearance.js';

test('o assento continua resolvendo manto e pele como antes', () => {
  // A derivação por índice era feita dentro de createNoble. Ao sair de lá ela
  // precisa produzir exatamente as mesmas cores, ou a mesa muda de aparência.
  for (let seat = 0; seat < 6; seat += 1) {
    assert.deepEqual(nobleAppearance(seat), {
      robe: ROBES[seat % ROBES.length],
      skin: NOBLE_SKINS[seat % 3],
    });
  }
  assert.notEqual(nobleAppearance(0).robe, nobleAppearance(1).robe);
  assert.notEqual(nobleAppearance(0).skin, nobleAppearance(1).skin);
});

test('a aparência é um descritor, não um assento', () => {
  // É o que permite construir um boneco fora da mesa — uma vitrine, e mais
  // adiante a customização — sem inventar um índice de cadeira para ele.
  const custom = { robe: 0x123456, skin: 0xabcdef };
  assert.deepEqual({ ...nobleAppearance(2), ...custom }, custom);
  assert.deepEqual(nobleAppearance(), nobleAppearance(0));
  assert.deepEqual(nobleAppearance(ROBES.length), nobleAppearance(0));
});
