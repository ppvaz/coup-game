import test from 'node:test';
import assert from 'node:assert/strict';
import { SALON_SEAT_RING, seatRingPoint, seatRingRadii } from '../src/lib/tabletop/coup-table/seat-ring.js';

test('o anel do salão encolhe em mesas de até três lugares', () => {
  assert.deepEqual(seatRingRadii(SALON_SEAT_RING, 3), { x: 5.15, z: 4.25 });
  assert.deepEqual(seatRingRadii(SALON_SEAT_RING, 4), { x: 5.55, z: 4.65 });
  assert.deepEqual(seatRingRadii(SALON_SEAT_RING, 6), { x: 5.55, z: 4.65 });
});

test('o ponto do assento segue o azimute e devolve a direção para fora', () => {
  const north = seatRingPoint(SALON_SEAT_RING, { azimuthRad: 0 }, 6);
  assert.equal(north.x, 0);
  assert.equal(north.z, 4.65);
  assert.deepEqual([north.outwardX, north.outwardZ], [0, 1]);

  const east = seatRingPoint(SALON_SEAT_RING, { azimuthRad: Math.PI / 2 }, 6);
  assert.equal(east.x, 5.55);
  assert.ok(Math.abs(east.z) < 1e-12);
});

test('as peças do salão pousam à frente do cortesão, que olha para -z', () => {
  for (const anchor of Object.values(SALON_SEAT_RING.props)) {
    assert.ok(anchor[2] < 0, `peça atrás do cortesão: ${anchor}`);
    assert.ok(anchor[1] > 1.2, `peça abaixo do tampo: ${anchor}`);
  }
});
