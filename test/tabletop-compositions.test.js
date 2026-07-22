import test from 'node:test';
import assert from 'node:assert/strict';
import { coinStackBounds, coinStackLayout } from '../src/lib/tabletop/coin-layout.js';
import { SALON_SEAT_RING, seatRingRadii } from '../src/lib/tabletop/coup-table/seat-ring.js';
import { councilPovCameraForSeat } from '../src/lib/tabletop/compositions/council/camera-layout.js';
import { COUNCIL_TABLE } from '../src/lib/tabletop/compositions/council/environment.js';
import { COUNCIL_SEAT_RING } from '../src/lib/tabletop/compositions/council/seat-ring.js';
import { nextTabletopComposition, tabletopCompositionFromSearch } from '../src/lib/tabletop/scene-compositions.js';

test('a composição experimental só pode ser selecionada quando o chamador autoriza', () => {
  assert.equal(tabletopCompositionFromSearch('?composition=council').id, 'classic');
  assert.equal(tabletopCompositionFromSearch('?composition=council', { allowExperimental: true }).id, 'council');
  assert.equal(tabletopCompositionFromSearch('?composition=inexistente', { allowExperimental: true }).id, 'classic');
  assert.equal(nextTabletopComposition('classic').id, 'council');
  assert.equal(nextTabletopComposition('council').id, 'classic');
});

const SEAT_RADIUS = seatRingRadii(COUNCIL_SEAT_RING, 6).x;

// O assento é uma base ortonormal: -z aponta para o centro, x corre paralelo à
// borda. O raio de um canto da peça é a hipotenusa desses dois eixos.
const cornerRadius = ([anchorX, , anchorZ], { x = 0, z = 0, halfWidth, halfDepth }) =>
  Math.max(
    ...[-1, 1].flatMap((sideX) =>
      [-1, 1].map((sideZ) =>
        Math.hypot(anchorX + x + sideX * halfWidth, SEAT_RADIUS + anchorZ + z + sideZ * halfDepth),
      ),
    ),
  );

test('a roda do Conselho é redonda: raio único em qualquer lotação', () => {
  const full = seatRingRadii(COUNCIL_SEAT_RING, 6);
  const small = seatRingRadii(COUNCIL_SEAT_RING, 3);
  assert.equal(full.x, full.z);
  assert.deepEqual(small, full);
  assert.ok(full.x > COUNCIL_TABLE.radius, 'a cadeira invadiria o tampo');
});

test('as peças do Conselho ficam inteiras sobre o feltro', () => {
  const { plaque, influences, exchange, coins } = COUNCIL_SEAT_RING.props;
  // Placa deitada (1,65 × 0,41 reduzida a 0,82) e cartas de 0,58 × 0,82 com a
  // inclinação máxima de 0,12 rad: as duas influências lado a lado e o leque
  // de quatro opções da troca.
  const card = { halfWidth: 0.337, halfDepth: 0.442 };
  const footprints = [
    [plaque, { halfWidth: 0.677, halfDepth: 0.169 }],
    [influences, card],
    [influences, { ...card, x: 0.7, z: 0.08 }],
    [exchange, { ...card, x: -1.08 }],
    [exchange, { ...card, x: 1.08 }],
  ];
  for (const [anchor, footprint] of footprints) {
    assert.ok(
      cornerRadius(anchor, footprint) <= COUNCIL_TABLE.feltRadius,
      `peça além do feltro: ${cornerRadius(anchor, footprint)}`,
    );
  }

  // Vinte moedas são dois blocos de pilhas; o segundo cresce em direção ao dono.
  const bounds = coinStackBounds(coinStackLayout(20), 0.12);
  const treasury = {
    x: bounds.centerX,
    z: bounds.centerZ,
    halfWidth: bounds.width / 2,
    halfDepth: bounds.depth / 2,
  };
  assert.ok(cornerRadius(coins, treasury) <= COUNCIL_TABLE.feltRadius, 'tesouro além do feltro');
});

test('as peças do Conselho repousam sobre o feltro, sem afundar nem flutuar', () => {
  const { plaque, influences, coins } = COUNCIL_SEAT_RING.props;
  assert.ok(plaque[1] > COUNCIL_TABLE.feltTop && plaque[1] < COUNCIL_TABLE.feltTop + 0.01);
  // Carta e moeda são sólidos centrados: a base fica meia espessura abaixo.
  assert.equal(Number((influences[1] - 0.0175).toFixed(4)), COUNCIL_TABLE.feltTop);
  assert.equal(Number((coins[1] - 0.0175).toFixed(4)), COUNCIL_TABLE.feltTop);
});

test('no Conselho as peças deitadas leem para o dono', () => {
  assert.deepEqual(COUNCIL_SEAT_RING.facing, { plaque: 0, influences: 0 });
  // O Salão encena a bancada de fora e não pode ser arrastado junto.
  assert.deepEqual(SALON_SEAT_RING.facing, { plaque: Math.PI, influences: Math.PI });
});

test('o POV Conselho enquadra as próprias cartas sem precisar arrastar', () => {
  const pov = councilPovCameraForSeat({ azimuthRad: 0 }, 6);
  const eyeRadius = Math.hypot(pov.position[0], pov.position[2]);
  const run = Math.hypot(pov.position[0] - pov.target[0], pov.position[2] - pov.target[2]);
  const pitch = Math.atan2(pov.position[1] - pov.target[1], run);
  const halfFov = ((pov.fov / 2) * Math.PI) / 180;

  const [, cardY, cardZ] = COUNCIL_SEAT_RING.props.influences;
  const borda = (edge) => Math.atan2(pov.position[1] - cardY, eyeRadius - (SEAT_RADIUS + cardZ + edge));
  assert.ok(borda(0.442) <= pitch + halfFov, 'a carta mais próxima cai fora do quadro');
  assert.ok(borda(-0.442) > pitch, 'a mira baixou demais e passou das próprias cartas');
  // O arrasto ainda precisa alcançar a carta que o repouso deixa na beirada.
  assert.ok(Math.PI / 2 + borda(0.442) <= pov.navigation.maxPolar);
});

test('o POV Conselho nasce nos olhos do assento e mira radialmente o centro', () => {
  const north = councilPovCameraForSeat({ azimuthRad: 0 }, 6);
  assert.deepEqual(north.position, [0, 2.08, 5.3]);
  assert.ok(north.target[2] < 0);
  assert.equal(north.navigation.mode, 'first-person');
  assert.equal(north.portrait.position, north.position);

  const east = councilPovCameraForSeat({ azimuthRad: Math.PI / 2 }, 6);
  assert.ok(east.position[0] > 5);
  assert.ok(east.target[0] < 0);
  assert.ok(Math.abs(east.position[2]) < 1e-12);
});
