import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HOURGLASS_FLOOR_Y,
  HOURGLASS_GLASS_PROFILE,
  hourglassGlassRadiusAt,
  hourglassSand,
} from '../src/lib/tabletop/hourglass-sand.js';

const GLASS_TOP_Y = HOURGLASS_GLASS_PROFILE.at(-1)[1];
const GLASS_BOTTOM_Y = HOURGLASS_GLASS_PROFILE[0][1];

// Amostra o cone em várias alturas: a parede curva pode ser mais estreita no
// meio do que nas pontas, então checar só a boca não prova contenção.
const coneEscapes = ({ radius, height, y }, apexUp) => {
  const base = y - height / 2;
  for (let step = 0; step <= 20; step += 1) {
    const progress = step / 20;
    const sampleY = base + height * progress;
    const sampleRadius = radius * (apexUp ? 1 - progress : progress);
    if (sampleRadius > hourglassGlassRadiusAt(sampleY) + 1e-9) return { sampleY, sampleRadius };
    if (sampleY < GLASS_BOTTOM_Y - 1e-9 || sampleY > GLASS_TOP_Y + 1e-9) return { sampleY, sampleRadius };
  }
  return null;
};

test('a areia nunca atravessa o vidro, em nenhuma fração do relógio', () => {
  for (let step = 0; step <= 200; step += 1) {
    const ratio = step / 200;
    const { top, bottom } = hourglassSand(ratio);
    assert.equal(coneEscapes(top, false), null, `areia de cima escapou em ratio=${ratio}`);
    assert.equal(coneEscapes(bottom, true), null, `areia de baixo escapou em ratio=${ratio}`);
  }
});

test('os segundos finais mantêm o resto da areia dentro do gargalo', () => {
  // A regressão: com raio fixo, o pouco que sobrava virava um disco de raio
  // 0.2 na altura do gargalo, onde o vidro tem raio 0.07.
  const { top } = hourglassSand(0.02);
  assert.ok(top.radius < hourglassGlassRadiusAt(0.49 + top.height), 'a boca cabe no gargalo');
  assert.ok(top.radius < 0.08, `a boca encolheu junto com a areia, veio ${top.radius}`);
});

test('o monte de baixo pousa no piso do vidro, não no vão do bronze', () => {
  const { bottom } = hourglassSand(0);
  assert.ok(Math.abs(bottom.y - bottom.height / 2 - HOURGLASS_FLOOR_Y) < 1e-9);
  assert.ok(HOURGLASS_FLOOR_Y >= GLASS_BOTTOM_Y, 'o piso da areia fica dentro do vidro');
  assert.ok(bottom.radius < hourglassGlassRadiusAt(HOURGLASS_FLOOR_Y), 'a base cabe no bulbo');
});

test('a ampulheta cheia e a vazia escondem o monte que não existe', () => {
  assert.equal(hourglassSand(1).bottom.visible, false);
  assert.equal(hourglassSand(0).top.visible, false);
  assert.equal(hourglassSand(0.5).top.visible, true);
  assert.equal(hourglassSand(0.5).bottom.visible, true);
});
