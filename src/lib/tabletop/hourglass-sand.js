// Dimensões da areia da ampulheta de decisão, puras para os testes de Node.
//
// O vidro é um `LatheGeometry`: uma silhueta de raios por altura, com gargalo
// estreito no meio. A areia mora dentro dessa silhueta, então o raio dos cones
// precisa sair do mesmo perfil. Cone de raio fixo escapa pela parede — era o
// caso do monte de cima, que virava um disco largo atravessando o gargalo
// quando o tempo acabava e a areia já estava vermelha.

// [raio, altura] — a mesma lista que alimenta o lathe do vidro em coup-table.js.
export const HOURGLASS_GLASS_PROFILE = [
  [0.24, 0.12],
  [0.25, 0.18],
  [0.07, 0.49],
  [0.25, 0.8],
  [0.24, 0.87],
];

const NECK_Y = 0.49;
const NECK_RADIUS = 0.07;
const SHOULDER_Y = 0.8;
const SHOULDER_RADIUS = 0.25;
// Inclinação do bulbo superior: o cone da areia acompanha esta reta.
const BULB_SLOPE = (SHOULDER_RADIUS - NECK_RADIUS) / (SHOULDER_Y - NECK_Y);

export const HOURGLASS_FLOOR_Y = 0.125;
const PILE_RADIUS = 0.23;
// Folga entre a areia e a parede: sem ela o cone encosta no vidro e o
// serrilhado das faces aparece atravessando a superfície.
const CLEARANCE = 0.93;
const SAND_SPAN = 0.31;

/** Raio interno do vidro na altura `y`, interpolando o perfil do lathe. */
export function hourglassGlassRadiusAt(y) {
  const [firstRadius, firstY] = HOURGLASS_GLASS_PROFILE[0];
  if (y <= firstY) return firstRadius;
  for (let index = 1; index < HOURGLASS_GLASS_PROFILE.length; index += 1) {
    const [radius, height] = HOURGLASS_GLASS_PROFILE[index];
    const [previousRadius, previousY] = HOURGLASS_GLASS_PROFILE[index - 1];
    if (y > height) continue;
    const progress = (y - previousY) / (height - previousY);
    return previousRadius + (radius - previousRadius) * progress;
  }
  return HOURGLASS_GLASS_PROFILE.at(-1)[0];
}

/**
 * Escala e posição dos dois montes de areia para uma fração de tempo restante.
 * `radius`/`height` multiplicam cones unitários; `y` é o centro de cada cone.
 */
export function hourglassSand(ratio) {
  const clamped = Math.min(1, Math.max(0, Number(ratio) || 0));
  const topHeight = Math.max(0.001, SAND_SPAN * clamped);
  const bottomHeight = Math.max(0.001, SAND_SPAN * (1 - clamped));
  return {
    top: {
      // A boca do cone fica na altura `NECK_Y + topHeight`; o raio ali é o do
      // vidro naquela altura, e o ápice fecha exatamente no gargalo.
      radius: (NECK_RADIUS + topHeight * BULB_SLOPE) * CLEARANCE,
      height: topHeight,
      y: NECK_Y + topHeight / 2,
      visible: clamped > 0.01,
    },
    bottom: {
      // O monte de baixo espalha até perto da parede e cresce para cima, com a
      // base pousada no piso do vidro — nunca abaixo dele, no vão do bronze.
      radius: PILE_RADIUS,
      height: bottomHeight,
      y: HOURGLASS_FLOOR_Y + bottomHeight / 2,
      visible: clamped < 0.99,
    },
  };
}
