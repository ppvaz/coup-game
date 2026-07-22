import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraRig } from '../packages/tabletop-stage/camera-rig.js';

const canvas = {
  addEventListener() {},
  removeEventListener() {},
  setPointerCapture() {},
  releasePointerCapture() {},
};

const shot = (x) => ({
  position: [x, 4, 8],
  target: [x, 2, 0],
  fov: 44,
  portrait: { position: [x, 6, 10], target: [x, 2, 0], fov: 54 },
});

test('redireciona um cinemático ativo sem reiniciar sua trajetória', () => {
  const rig = new CameraRig(canvas);
  rig.resize(1000, 600, 'landscape');
  rig.defineAct('subject', shot(0));
  rig.setAct('subject');
  const startedAt = rig.tween.startedAt;

  assert.equal(rig.retargetAct('subject', shot(3)), true);
  assert.equal(rig.tween.startedAt, startedAt);
  assert.equal(rig.tween.toPosition.x, 3);
  assert.equal(rig.tween.toTarget.x, 3);

  rig.update(startedAt + rig.tween.duration);
  assert.equal(rig.camera.position.x, 3);
  assert.equal(rig.retargetAct('subject', shot(5)), true);
  assert.equal(rig.camera.position.x, 5);
  assert.equal(rig.target.x, 5);
  rig.dispose();
});

test('redirecionar um ato inativo apenas atualiza sua definição', () => {
  const rig = new CameraRig(canvas);
  rig.resize(1000, 600, 'landscape');
  rig.defineAct('table', shot(0));
  rig.setAct('table', { immediate: true });
  assert.equal(rig.retargetAct('subject', shot(4)), false);
  assert.equal(rig.camera.position.x, 0);
  rig.dispose();
});
