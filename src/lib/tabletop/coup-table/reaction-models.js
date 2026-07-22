import * as THREE from 'three';
import { canvasTexture } from '@la-corte/tabletop-stage';
import { createCourtCoin } from './coins.js';
import { applyDecisionClock, createDecisionHourglass } from './decision-props.js';
import { COLORS, mesh, standardMaterial } from './primitives.js';

export function createEmojiSprite(emoji) {
  const texture = canvasTexture(
    (context, canvas) => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'rgba(12, 9, 7, 0.88)';
      context.beginPath();
      context.roundRect(18, 22, canvas.width - 36, canvas.height - 54, 36);
      context.fill();
      context.strokeStyle = '#d9b56b';
      context.lineWidth = 6;
      context.stroke();
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = '112px sans-serif';
      context.fillText(emoji, canvas.width / 2, canvas.height / 2 - 4);
    },
    { width: 256, height: 256 },
  );
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.25, 1.25, 1);
  sprite.renderOrder = 20;
  return sprite;
}

export function createThrowable(type) {
  const group = new THREE.Group();
  group.name = `court-throwable-${type}`;
  if (type === 'tomato') {
    group.add(mesh(new THREE.SphereGeometry(0.22, 10, 7), standardMaterial(0xb52e2f), { cast: false }));
    const leaves = mesh(new THREE.ConeGeometry(0.13, 0.1, 5), standardMaterial(0x35542b), {
      position: [0, 0.22, 0],
      cast: false,
    });
    group.add(leaves);
  } else if (type === 'glove') {
    const leather = standardMaterial(0xe5d2ae);
    group.add(mesh(new THREE.BoxGeometry(0.28, 0.34, 0.12), leather, { cast: false }));
    for (let index = 0; index < 4; index += 1) {
      group.add(
        mesh(new THREE.CapsuleGeometry(0.035, 0.2, 3, 6), standardMaterial(0xe5d2ae), {
          position: [-0.105 + index * 0.07, 0.25 + Math.abs(1.5 - index) * 0.015, 0],
          cast: false,
        }),
      );
    }
  } else if (type === 'rose') {
    group.add(
      mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 6), standardMaterial(0x315b32), {
        rotation: [0, 0, 0.25],
        cast: false,
      }),
    );
    group.add(
      mesh(new THREE.SphereGeometry(0.16, 9, 6), standardMaterial(0xa92739), {
        position: [-0.08, 0.34, 0],
        scale: [1, 0.8, 1],
        cast: false,
      }),
    );
  } else if (type === 'ambassador_card') {
    const letter = standardMaterial(0xe3d8c3, {
      emissive: 0xe3d8c3,
      emissiveIntensity: 0.08,
      roughness: 0.9,
    });
    const seal = standardMaterial(0x2f725a, { roughness: 0.68 });
    group.add(mesh(new THREE.BoxGeometry(0.5, 0.34, 0.035), letter, { cast: false }));
    group.add(
      mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.028, 12), seal, {
        position: [0, -0.015, 0.03],
        rotation: [Math.PI / 2, 0, 0],
        cast: false,
      }),
    );
  } else if (type === 'assassin_dagger') {
    const blade = standardMaterial(0xc6c1b7, { metalness: 0.78, roughness: 0.2 });
    const grip = standardMaterial(0x43191b, { roughness: 0.7 });
    const guard = standardMaterial(COLORS.gold, { metalness: 0.48, roughness: 0.34 });
    group.add(
      mesh(new THREE.ConeGeometry(0.085, 0.5, 4), blade, {
        position: [0, 0.16, 0],
        rotation: [0, Math.PI / 4, 0],
        cast: false,
      }),
    );
    group.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.25, 7), grip, { position: [0, -0.21, 0], cast: false }));
    group.add(mesh(new THREE.BoxGeometry(0.28, 0.045, 0.06), guard, { position: [0, -0.08, 0], cast: false }));
  } else if (type === 'duke_coin') {
    group.add(createCourtCoin({ upright: true }));
  } else if (type === 'hourglass') {
    // "Seu tempo acabou": a mesma peça do relógio de decisão, reduzida ao
    // tamanho dos outros arremessos e centrada no próprio eixo para girar.
    const hourglass = createDecisionHourglass();
    hourglass.group.visible = true;
    hourglass.group.scale.setScalar(0.46);
    hourglass.group.position.y = -0.225;
    // Meia areia, longe do vermelho: é adereço, não relógio.
    applyDecisionClock(hourglass, 0.5, 30_000);
    group.add(hourglass.group);
  }
  return group;
}
