import test from 'node:test';
import assert from 'node:assert/strict';
import { councilPovCameraForSeat } from '../src/lib/tabletop/compositions/council/camera-layout.js';
import { nextTabletopComposition, tabletopCompositionFromSearch } from '../src/lib/tabletop/scene-compositions.js';

test('a composição experimental só pode ser selecionada quando o chamador autoriza', () => {
  assert.equal(tabletopCompositionFromSearch('?composition=council').id, 'classic');
  assert.equal(tabletopCompositionFromSearch('?composition=council', { allowExperimental: true }).id, 'council');
  assert.equal(tabletopCompositionFromSearch('?composition=inexistente', { allowExperimental: true }).id, 'classic');
  assert.equal(nextTabletopComposition('classic').id, 'council');
  assert.equal(nextTabletopComposition('council').id, 'classic');
});

test('o POV Conselho nasce nos olhos do assento e mira radialmente o centro', () => {
  const north = councilPovCameraForSeat({ azimuthRad: 0 }, 6);
  assert.deepEqual(north.position, [0, 2.08, 4.45]);
  assert.ok(north.target[2] < 0);
  assert.equal(north.navigation.mode, 'first-person');
  assert.equal(north.portrait.position, north.position);

  const east = councilPovCameraForSeat({ azimuthRad: Math.PI / 2 }, 6);
  assert.ok(east.position[0] > 5);
  assert.ok(east.target[0] < 0);
  assert.ok(Math.abs(east.position[2]) < 1e-12);
});
