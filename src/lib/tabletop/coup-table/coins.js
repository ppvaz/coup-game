import * as THREE from 'three';
import { canvasTexture } from '@la-corte/tabletop-stage';
import { coinStackBounds, coinStackLayout } from '../coin-layout.js';
import { COLORS, mesh, standardMaterial } from './primitives.js';

function coinMaterials() {
  return {
    body: standardMaterial(COLORS.gold, {
      emissive: COLORS.gold,
      emissiveIntensity: 0.1,
      metalness: 0.82,
      roughness: 0.24,
    }),
    relief: standardMaterial(COLORS.bronze, {
      metalness: 0.68,
      roughness: 0.32,
    }),
  };
}

/** Uma moeda da corte; o nome da reação não altera a identidade da peça. */
export function createCourtCoin({ radius = 0.22, thickness = 0.055, upright = false } = {}) {
  const group = new THREE.Group();
  group.name = 'court-coin';
  const materials = coinMaterials();
  group.add(mesh(new THREE.CylinderGeometry(radius, radius, thickness, 20), materials.body, { cast: false }));
  group.add(
    mesh(new THREE.TorusGeometry(radius * 0.7, radius * 0.055, 5, 20), materials.relief, {
      position: [0, thickness / 2 + 0.003, 0],
      rotation: [Math.PI / 2, 0, 0],
      cast: false,
    }),
  );
  group.add(
    mesh(new THREE.BoxGeometry(radius * 0.44, thickness * 0.18, radius * 0.44), materials.relief, {
      position: [0, thickness / 2 + 0.006, 0],
      rotation: [0, Math.PI / 4, 0],
      cast: false,
    }),
  );
  if (upright) group.rotation.x = Math.PI / 2;
  return group;
}

function setInstanceTransform(instances, index, position, rotation) {
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion().setFromEuler(rotation);
  matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
  instances.setMatrixAt(index, matrix);
}

export function createCoinTreasury(count) {
  const group = new THREE.Group();
  group.name = 'court-treasury';
  const layout = coinStackLayout(count);
  const radius = 0.12;
  const bounds = coinStackBounds(layout, radius);

  if (layout.length) {
    const thickness = 0.035;
    const materials = coinMaterials();
    const bodies = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(radius, radius, thickness, 16),
      materials.body,
      layout.length,
    );
    const rims = new THREE.InstancedMesh(
      new THREE.TorusGeometry(radius * 0.7, radius * 0.055, 5, 16),
      materials.relief,
      layout.length,
    );
    const seals = new THREE.InstancedMesh(
      new THREE.BoxGeometry(radius * 0.44, thickness * 0.18, radius * 0.44),
      materials.relief.clone(),
      layout.length,
    );

    layout.forEach((coin, index) => {
      setInstanceTransform(
        bodies,
        index,
        new THREE.Vector3(coin.x, coin.y, coin.z),
        new THREE.Euler(0, coin.rotationY, 0),
      );
      setInstanceTransform(
        rims,
        index,
        new THREE.Vector3(coin.x, coin.y + thickness / 2 + 0.003, coin.z),
        new THREE.Euler(Math.PI / 2, 0, 0),
      );
      setInstanceTransform(
        seals,
        index,
        new THREE.Vector3(coin.x, coin.y + thickness / 2 + 0.006, coin.z),
        new THREE.Euler(0, coin.rotationY + Math.PI / 4, 0),
      );
    });
    for (const instances of [bodies, rims, seals]) {
      instances.instanceMatrix.needsUpdate = true;
      instances.castShadow = true;
      instances.receiveShadow = true;
      group.add(instances);
    }
  }

  const hitArea = mesh(
    new THREE.BoxGeometry(Math.max(0.42, bounds.width), bounds.height, Math.max(0.42, bounds.depth)),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    { position: [bounds.centerX, bounds.centerY, bounds.centerZ], cast: false, receive: false },
  );
  hitArea.name = 'private-coin-hit-area';
  group.add(hitArea);
  return group;
}

export function createTreasureLabel(coins) {
  const texture = canvasTexture(
    (context, canvas) => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'rgba(12, 9, 7, .94)';
      context.beginPath();
      context.roundRect(8, 8, canvas.width - 16, canvas.height - 16, 18);
      context.fill();
      context.strokeStyle = '#d9b56b';
      context.lineWidth = 5;
      context.stroke();
      context.textAlign = 'center';
      context.fillStyle = '#d9b56b';
      context.font = "700 18px 'DM Sans', sans-serif";
      context.fillText('SEU TESOURO', canvas.width / 2, 42);
      context.fillStyle = '#eee6d6';
      context.font = "600 38px 'Cormorant Garamond', serif";
      context.fillText(`◆ ${coins} ${coins === 1 ? 'MOEDA' : 'MOEDAS'}`, canvas.width / 2, 88);
    },
    { width: 384, height: 112 },
  );
  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      toneMapped: false,
    }),
  );
  label.name = 'private-treasure-label';
  label.scale.set(1.4, 0.41, 1);
  label.renderOrder = 20;
  label.visible = false;
  return label;
}
