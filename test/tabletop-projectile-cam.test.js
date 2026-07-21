import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECTILE_CAM,
  bezierDirection,
  bezierPoint,
  isOutsideFrame,
  projectileCamAnchor,
  projectileCamPose,
} from '@la-corte/tabletop-stage/projectile-cam';

const start = { x: -4, y: 2.25, z: 0 };
const control = { x: 0, y: 4.15, z: 0 };
const end = { x: 4, y: 2.08, z: 0 };
const viewport = { width: 1280, height: 720 };

test('a curva do arremesso liga a origem ao alvo passando pelo alto', () => {
  assert.deepEqual(bezierPoint(start, control, end, 0), start);
  assert.deepEqual(bezierPoint(start, control, end, 1), end);
  const middle = bezierPoint(start, control, end, 0.5);
  assert.equal(middle.x, 0);
  assert.ok(middle.y > start.y && middle.y > end.y);
});

test('a direção do voo aponta para o alvo e desce depois do ápice', () => {
  const rising = bezierDirection(start, control, end, 0.1);
  const falling = bezierDirection(start, control, end, 0.9);
  assert.ok(rising.x > 0 && falling.x > 0);
  assert.ok(rising.y > 0, 'sobe na saída');
  assert.ok(falling.y < 0, 'desce na chegada');
  assert.ok(Math.abs(Math.hypot(rising.x, rising.y, rising.z) - 1) < 1e-9);
});

test('a direção degenera com segurança quando não há deslocamento', () => {
  const still = { x: 1, y: 1, z: 1 };
  assert.deepEqual(bezierDirection(still, still, still, 0.5), { x: 0, y: 0, z: 1 });
});

test('o objeto conta como fora do quadro na borda e atrás da câmera', () => {
  assert.equal(isOutsideFrame({ x: 0.2, y: -0.4, z: 0.5 }), false);
  assert.equal(isOutsideFrame({ x: 0.99, y: 0, z: 0.5 }), true);
  assert.equal(isOutsideFrame({ x: 0, y: -0.97, z: 0.5 }), true);
  assert.equal(isOutsideFrame({ x: 0, y: 0, z: 1.4 }), true, 'passou atrás da câmera');
});

test('a folga adianta a abertura em relação à borda real', () => {
  const almost = { x: 0.95, y: 0, z: 0.5 };
  assert.equal(isOutsideFrame(almost), true);
  assert.equal(isOutsideFrame(almost, 0.01), false);
});

test('a câmera de perseguição fica atrás e acima do objeto, mirando à frente', () => {
  const position = { x: 0, y: 3, z: 0 };
  const direction = { x: 1, y: 0, z: 0 };
  const pose = projectileCamPose({ position, direction });
  assert.equal(pose.position[0], -PROJECTILE_CAM.distance);
  assert.equal(pose.position[1], 3 + PROJECTILE_CAM.height);
  assert.equal(pose.target[0], PROJECTILE_CAM.lead);
  assert.ok(pose.target[0] > pose.position[0], 'a mira vai à frente da câmera');
});

test('o PiP encosta na borda por onde o objeto saiu', () => {
  const right = projectileCamAnchor({ x: 1.4, y: 0.1, z: 0.5 }, viewport);
  assert.equal(right.edge, 'right');
  assert.equal(right.left, viewport.width - PROJECTILE_CAM.gap - PROJECTILE_CAM.size);

  const left = projectileCamAnchor({ x: -1.4, y: 0.1, z: 0.5 }, viewport);
  assert.equal(left.edge, 'left');
  assert.equal(left.left, PROJECTILE_CAM.gap);

  const top = projectileCamAnchor({ x: 0.1, y: 1.4, z: 0.5 }, viewport);
  assert.equal(top.edge, 'top');
  assert.equal(top.top, PROJECTILE_CAM.gap);

  const bottom = projectileCamAnchor({ x: -0.1, y: -1.4, z: 0.5 }, viewport);
  assert.equal(bottom.edge, 'bottom');
  assert.equal(bottom.top, viewport.height - PROJECTILE_CAM.gap - PROJECTILE_CAM.size);
});

test('o PiP acompanha a altura da saída sem vazar da tela', () => {
  const high = projectileCamAnchor({ x: 1.2, y: 0.98, z: 0.5 }, viewport);
  const low = projectileCamAnchor({ x: 1.2, y: -0.98, z: 0.5 }, viewport);
  assert.ok(high.top < low.top, 'sair por cima ancora mais alto');
  for (const anchor of [high, low]) {
    assert.ok(anchor.top >= PROJECTILE_CAM.gap);
    assert.ok(anchor.top + anchor.size <= viewport.height - PROJECTILE_CAM.gap);
    assert.ok(anchor.left + anchor.size <= viewport.width - PROJECTILE_CAM.gap);
  }
});

test('o objeto atrás da câmera ancora no lado real da saída', () => {
  const behind = projectileCamAnchor({ x: -0.9, y: 0.2, z: 1.6 }, viewport);
  assert.equal(behind.edge, 'right', 'a projeção de trás vem espelhada');
});

test('em telas menores que a janela o PiP ainda cabe na viewport', () => {
  const tiny = { width: 160, height: 140 };
  const anchor = projectileCamAnchor({ x: 1.4, y: -1.2, z: 0.5 }, tiny);
  assert.ok(anchor.left >= 0 && anchor.top >= 0);
});
