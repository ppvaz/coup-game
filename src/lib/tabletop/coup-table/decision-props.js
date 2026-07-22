import * as THREE from 'three';
import { HOURGLASS_GLASS_PROFILE, hourglassSand } from '../hourglass-sand.js';
import { COLORS, mesh, standardMaterial } from './primitives.js';

export const DECISION_BUBBLE_ANCHOR = new THREE.Vector3(-1.05, 2.34, -0.42);

export function createDecisionHourglass() {
  const group = new THREE.Group();
  group.name = 'decision-hourglass';
  group.visible = false;

  const frame = standardMaterial(COLORS.bronze, { metalness: 0.72, roughness: 0.3 });
  const sand = standardMaterial(COLORS.gold, {
    emissive: COLORS.gold,
    emissiveIntensity: 0.12,
    roughness: 0.86,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xe9dfcf,
    transparent: true,
    opacity: 0.2,
    roughness: 0.08,
    metalness: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const baseGeometry = new THREE.CylinderGeometry(0.33, 0.38, 0.075, 12);
  group.add(mesh(baseGeometry, frame, { position: [0, 0.04, 0] }));
  group.add(mesh(baseGeometry, frame, { position: [0, 0.94, 0] }));
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.024, 0.024, 0.82, 6), frame, 4);
  const matrix = new THREE.Matrix4();
  [
    [-0.29, 0.49, -0.17],
    [0.29, 0.49, -0.17],
    [-0.29, 0.49, 0.17],
    [0.29, 0.49, 0.17],
  ].forEach((position, index) => {
    matrix.makeTranslation(...position);
    posts.setMatrixAt(index, matrix);
  });
  posts.instanceMatrix.needsUpdate = true;
  posts.castShadow = true;
  group.add(posts);

  const glassProfile = HOURGLASS_GLASS_PROFILE.map(([radius, height]) => new THREE.Vector2(radius, height));
  group.add(mesh(new THREE.LatheGeometry(glassProfile, 14), glass, { cast: false, receive: false }));
  const topSand = mesh(new THREE.ConeGeometry(1, 1, 12), sand, {
    position: [0, 0.64, 0],
    rotation: [0, 0, Math.PI],
    cast: false,
  });
  const bottomSand = mesh(new THREE.ConeGeometry(1, 1, 12), sand, { position: [0, 0.12, 0], cast: false });
  const stream = mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.22, 5), sand, {
    position: [0, 0.49, 0],
    cast: false,
  });
  group.add(topSand, bottomSand, stream);
  return { group, sand, topSand, bottomSand, stream, urgent: false };
}

export function createDecisionBubble() {
  const group = new THREE.Group();
  group.name = 'decision-bubble';
  group.visible = false;
  const hourglass = createDecisionHourglass();
  hourglass.group.visible = true;
  hourglass.group.scale.setScalar(0.52);
  hourglass.group.position.y = -0.255;
  group.add(hourglass.group);
  group.add(
    mesh(
      new THREE.SphereGeometry(0.36, 20, 14),
      new THREE.MeshPhysicalMaterial({
        color: 0xe9dfcf,
        transparent: true,
        opacity: 0.16,
        roughness: 0.06,
        metalness: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      { cast: false, receive: false },
    ),
  );
  group.add(
    mesh(
      new THREE.TorusGeometry(0.36, 0.022, 8, 28),
      standardMaterial(COLORS.bronze, { metalness: 0.72, roughness: 0.3 }),
      {
        rotation: [-Math.PI / 2, 0, 0],
        cast: false,
      },
    ),
  );
  return { group, hourglass };
}

export function applyDecisionClock(hourglass, ratio, remaining) {
  const { top, bottom } = hourglassSand(ratio);
  hourglass.topSand.visible = top.visible;
  hourglass.topSand.scale.set(top.radius, top.height, top.radius);
  hourglass.topSand.position.y = top.y;
  hourglass.bottomSand.visible = bottom.visible;
  hourglass.bottomSand.scale.set(bottom.radius, bottom.height, bottom.radius);
  hourglass.bottomSand.position.y = bottom.y;
  hourglass.stream.visible = remaining > 0 && ratio < 0.995;
  const urgent = remaining <= 5_000;
  if (urgent === hourglass.urgent) return;
  const color = urgent ? COLORS.danger : COLORS.gold;
  hourglass.sand.color.setHex(color);
  hourglass.sand.emissive.setHex(color);
  hourglass.sand.emissiveIntensity = urgent ? 0.42 : 0.12;
  hourglass.urgent = urgent;
}
