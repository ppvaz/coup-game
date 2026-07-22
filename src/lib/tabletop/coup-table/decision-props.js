import * as THREE from 'three';
import { canvasTexture } from '@la-corte/tabletop-stage';
import { HOURGLASS_GLASS_PROFILE, hourglassSand } from '../hourglass-sand.js';
import { createInterventionFigure, createRoleFigure } from './figures.js';
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

function decisionOptionTexture(option) {
  const accent = option.tone === 'danger' ? '#e16466' : '#d9b56b';
  return canvasTexture(
    (context, canvas) => {
      context.fillStyle = option.enabled ? '#100c09' : '#171411';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = option.enabled ? accent : '#564f47';
      context.lineWidth = 9;
      context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = option.enabled ? '#f0e6d3' : '#746c62';
      context.font = "600 39px 'Cormorant Garamond', serif";
      context.fillText(option.label.toUpperCase(), canvas.width / 2, 65);
      context.fillStyle = option.enabled ? accent : '#625b53';
      context.font = "700 13px 'DM Sans', sans-serif";
      context.fillText(option.kicker.toUpperCase(), canvas.width / 2, 116);
    },
    { width: 384, height: 148 },
  );
}

/** Placa física da bancada. A cena só conhece seu ID, texto e disponibilidade. */
export function createDecisionOption(option) {
  const group = new THREE.Group();
  group.name = `decision-${option.id.replace(':', '-')}`;
  const accent = option.tone === 'danger' ? COLORS.danger : COLORS.gold;
  const edge = standardMaterial(option.enabled ? accent : 0x4c4640, { metalness: 0.55, roughness: 0.36 });
  const face = new THREE.MeshBasicMaterial({
    map: decisionOptionTexture(option),
    color: 0xffffff,
    toneMapped: false,
  });
  group.add(mesh(new THREE.BoxGeometry(1.08, 0.66, 0.075), edge));
  group.add(
    mesh(new THREE.PlaneGeometry(1.02, 0.6), face, {
      position: [0, 0, -0.041],
      rotation: [0, Math.PI, 0],
      cast: false,
      receive: false,
    }),
  );
  const hover = mesh(
    new THREE.PlaneGeometry(1.18, 0.76),
    new THREE.MeshBasicMaterial({
      color: option.tone === 'danger' ? 0xff8585 : 0xffe1a0,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
    { position: [0, 0, -0.048], rotation: [0, Math.PI, 0], cast: false, receive: false },
  );
  hover.visible = false;
  group.add(hover);
  group.userData.decisionId = option.id;
  group.userData.enabled = option.enabled;
  return { group, hover, id: option.id, enabled: option.enabled };
}

/** Efígie clicável para contestar, bloquear ou permitir uma alegação. */
export function createDecisionEffigy(option) {
  const group = new THREE.Group();
  group.name = `intervention-${option.id.replace(':', '-')}`;
  const role = option.id.startsWith('block:') ? option.id.slice('block:'.length) : null;
  const figure = role
    ? createRoleFigure(role)
    : createInterventionFigure(option.id === 'response:challenge' ? 'challenge' : 'allow');
  figure.scale.setScalar(role ? 0.62 : 0.72);
  group.add(figure);

  const label = createDecisionOption({ ...option, kicker: role ? 'BLOQUEAR' : option.kicker });
  label.group.scale.setScalar(0.82);
  label.group.position.set(0, 0.24, 0.62);
  label.group.rotation.y = Math.PI;
  group.add(label.group);

  const hitbox = mesh(
    new THREE.BoxGeometry(1.3, 2.15, 1.05),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    { position: [0, 1.05, 0.12], cast: false, receive: false },
  );
  group.add(hitbox);
  group.userData.decisionId = option.id;
  group.userData.enabled = option.enabled;
  return { group, hover: label.hover, id: option.id, enabled: option.enabled };
}
