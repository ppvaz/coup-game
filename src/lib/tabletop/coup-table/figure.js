// Ponto único onde um descritor de aparência vira boneco. A mesa pede uma
// figura para uma cadeira e recebe sempre o mesmo contrato de rig, sem saber se
// sentou um nobre da corte ou um cultista.

import { resolveCharacter } from './character.js';
import { createNoble } from './figures.js';
import { createCultist } from './cultist.js';

export function createFigure(appearance, { name = '' } = {}) {
  const params = resolveCharacter(appearance);
  if (params.figure === 'cultist') {
    return createCultist({
      robe: params.robe,
      accent: params.accent,
      hood: params.hood,
      face: params.face,
      relic: params.relic,
      name,
    });
  }
  return createNoble({
    robe: params.robe,
    skin: params.skin,
    hair: params.hair,
    adorno: params.adorno,
  });
}
