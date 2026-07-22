import * as THREE from 'three';
import {
  createCarpetTexture,
  createCourtSealTexture,
  createCurtainTexture,
  createFloorTexture,
  createMarbleTexture,
  createMedallionTexture,
  createOutsideViewTexture,
  createPlasterTexture,
  mulberry32,
} from './coup-environment/textures.js';

const PALETTES = {
  dark: {
    plasterDark: 0x3d332b,
    stone: 0x71675b,
    marble: 0x393631,
    wood: 0x43271b,
    woodLight: 0x70452d,
    velvet: 0x71272b,
    velvetDark: 0x3c1518,
    gold: 0xd9b56b,
    bronze: 0x765329,
  },
  light: {
    plasterDark: 0xa9987d,
    stone: 0xc1ad8b,
    marble: 0x8f826e,
    wood: 0x4a2818,
    woodLight: 0x70452a,
    velvet: 0x6f252b,
    velvetDark: 0x3b171a,
    gold: 0xc59a49,
    bronze: 0x9b7337,
  },
};

const ROLE_SIGILS = [
  { glyph: '♛', name: 'DUQUE' },
  { glyph: '†', name: 'ASSASSINA' },
  { glyph: '✦', name: 'CAPITÃO' },
  { glyph: '✉', name: 'EMBAIXADORA' },
  { glyph: '❦', name: 'CONDESSA' },
];

function material(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.06, ...options });
}

function mesh(geometry, meshMaterial, { position, rotation, scale, cast = false, receive = true } = {}) {
  const value = new THREE.Mesh(geometry, meshMaterial);
  if (position) value.position.set(...position);
  if (rotation) value.rotation.set(...rotation);
  if (scale) value.scale.set(...scale);
  value.castShadow = cast;
  value.receiveShadow = receive;
  return value;
}

function archShape(width, height, inset = 0) {
  const half = width / 2 - inset;
  const top = height - inset;
  const spring = top - half;
  const bottom = inset;
  const shape = new THREE.Shape();
  shape.moveTo(-half, bottom);
  shape.lineTo(-half, spring);
  shape.quadraticCurveTo(-half, top, 0, top);
  shape.quadraticCurveTo(half, top, half, spring);
  shape.lineTo(half, bottom);
  shape.closePath();
  return shape;
}

function createWindow(index, x, palette, theme) {
  const group = new THREE.Group();
  group.position.set(x, 0.75, -10.48);
  const width = 3.45;
  const height = 6.25;
  const outer = archShape(width, height);
  outer.holes.push(archShape(width, height, 0.22));
  const frame = mesh(new THREE.ShapeGeometry(outer, 20), material(palette.stone, { roughness: 0.95 }), {
    position: [0, 0, 0.045],
  });
  group.add(frame);

  const glass = mesh(
    new THREE.PlaneGeometry(width - 0.38, height - 0.38),
    new THREE.MeshBasicMaterial({
      map: createOutsideViewTexture(index, theme),
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
    // A parede cenográfica é maciça: este pequeno recuo mantém o panorama
    // atrás do aro sem deixá-lo entrar no volume opaco da parede.
    { position: [0, height / 2, -0.045], cast: false, receive: false },
  );
  group.add(glass);

  const trimShape = archShape(width, height, 0.12);
  trimShape.holes.push(archShape(width, height, 0.22));
  group.add(
    mesh(new THREE.ShapeGeometry(trimShape, 20), material(palette.gold, { metalness: 0.64, roughness: 0.34 }), {
      position: [0, 0, 0.105],
    }),
  );
  const sill = mesh(new THREE.BoxGeometry(width + 0.35, 0.18, 0.42), material(palette.stone), {
    position: [0, -0.06, 0.15],
  });
  group.add(sill);
  const balconyStone = material(palette.stone, { roughness: 0.94 });
  group.add(
    mesh(new THREE.BoxGeometry(width - 0.38, 0.12, 0.18), balconyStone, {
      position: [0, 0.72, 0.32],
    }),
  );
  group.add(
    mesh(new THREE.BoxGeometry(width - 0.38, 0.1, 0.16), balconyStone, {
      position: [0, 0.08, 0.3],
    }),
  );
  const balusters = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.085, 0.58, 7), balconyStone, 6);
  balusters.castShadow = false;
  balusters.receiveShadow = true;
  const balusterMatrix = new THREE.Matrix4();
  for (let baluster = 0; baluster < 6; baluster += 1) {
    balusterMatrix.makeTranslation(-1.22 + baluster * 0.49, 0.4, 0.31);
    balusters.setMatrixAt(baluster, balusterMatrix);
  }
  group.add(balusters);
  for (const side of [-1, 1]) group.add(createCurtain(side, palette, theme).group);
  return group;
}

function createCurtain(side, palette, theme) {
  const group = new THREE.Group();
  group.position.set(side * 1.5, 3.08, 0.5);
  group.rotation.y = side * -0.12;
  const geometry = new THREE.PlaneGeometry(0.72, 5.05, 6, 14);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const localX = positions.getX(index);
    const localY = positions.getY(index);
    const tieDistance = Math.min(1, Math.abs(localY + 0.12) / 2.35);
    const widthScale = 0.42 + tieDistance * 0.58;
    positions.setX(index, localX * widthScale);
    positions.setZ(index, Math.sin(localY * 3.2 + localX * 4.4) * 0.035 + Math.abs(localX) * 0.025);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  const cloth = mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      map: createCurtainTexture(theme),
      roughness: 0.94,
      metalness: 0,
      side: THREE.DoubleSide,
    }),
    { cast: false },
  );
  group.add(cloth);
  group.add(
    mesh(new THREE.TorusGeometry(0.14, 0.025, 6, 16), material(palette.gold, { metalness: 0.72 }), {
      position: [0, -0.12, 0.08],
      scale: [1, 0.58, 1],
      cast: false,
    }),
  );
  return { group, cloth };
}

function createColumn(x, z, scale, palette) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  const stone = material(palette.stone, { roughness: 0.94 });
  group.add(mesh(new THREE.CylinderGeometry(0.46, 0.58, 6.8, 12), stone, { position: [0, 3.2, 0] }));
  group.add(mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.22, 12), stone, { position: [0, 6.57, 0] }));
  group.add(mesh(new THREE.CylinderGeometry(0.62, 0.74, 0.31, 12), stone, { position: [0, 0.07, 0] }));
  for (const y of [0.34, 6.35]) {
    group.add(
      mesh(new THREE.TorusGeometry(0.55, 0.055, 6, 14), stone, { position: [0, y, 0], rotation: [Math.PI / 2, 0, 0] }),
    );
  }
  return group;
}

function createGrandDoor(palette, theme) {
  const daylight = theme === 'light';
  const group = new THREE.Group();
  group.name = 'grand-council-door';
  group.position.set(0, 0, 12.72);
  group.rotation.y = Math.PI;

  const stone = material(palette.stone, { roughness: 0.9 });
  const wood = material(palette.woodLight, {
    roughness: 0.66,
    emissive: daylight ? 0x000000 : 0x27130c,
    emissiveIntensity: daylight ? 0 : 0.09,
  });
  const darkWood = material(palette.wood, { roughness: 0.72 });
  const gold = material(palette.gold, { metalness: 0.76, roughness: 0.25 });

  group.add(mesh(new THREE.BoxGeometry(5.65, 5.65, 0.38), stone, { position: [0, 2.78, -0.08] }));
  group.add(mesh(new THREE.BoxGeometry(4.35, 5.05, 0.42), darkWood, { position: [0, 2.48, 0.12] }));

  for (const x of [-1.08, 1.08]) {
    group.add(mesh(new THREE.BoxGeometry(2.02, 4.72, 0.24), wood, { position: [x, 2.42, 0.36] }));
    for (const y of [1.08, 2.35, 3.63]) {
      group.add(mesh(new THREE.BoxGeometry(1.62, 0.94, 0.08), darkWood, { position: [x, y, 0.51] }));
      group.add(mesh(new THREE.BoxGeometry(1.42, 0.72, 0.075), wood, { position: [x, y, 0.57] }));
    }
    group.add(mesh(new THREE.BoxGeometry(0.055, 4.45, 0.07), gold, { position: [x, 2.42, 0.64] }));
  }

  for (const x of [-2.52, 2.52]) {
    group.add(mesh(new THREE.BoxGeometry(0.62, 5.45, 0.66), stone, { position: [x, 2.67, 0.18] }));
    group.add(mesh(new THREE.BoxGeometry(0.86, 0.28, 0.86), stone, { position: [x, 0.18, 0.18] }));
    group.add(mesh(new THREE.BoxGeometry(0.86, 0.32, 0.86), stone, { position: [x, 5.28, 0.18] }));
    group.add(mesh(new THREE.BoxGeometry(0.12, 4.84, 0.08), gold, { position: [x, 2.7, 0.56] }));
  }

  group.add(mesh(new THREE.BoxGeometry(6.4, 0.42, 0.82), stone, { position: [0, 5.48, 0.12] }));
  const pedimentShape = new THREE.Shape();
  pedimentShape.moveTo(-3.2, 0);
  pedimentShape.lineTo(0, 1.32);
  pedimentShape.lineTo(3.2, 0);
  pedimentShape.closePath();
  group.add(
    mesh(new THREE.ShapeGeometry(pedimentShape), stone, {
      position: [0, 5.54, 0.22],
    }),
  );
  const pedimentInlay = new THREE.Shape();
  pedimentInlay.moveTo(-2.72, 0.1);
  pedimentInlay.lineTo(0, 1.11);
  pedimentInlay.lineTo(2.72, 0.1);
  group.add(
    mesh(new THREE.ShapeGeometry(pedimentInlay), gold, {
      position: [0, 5.63, 0.31],
    }),
  );
  group.add(mesh(new THREE.CircleGeometry(0.42, 28), darkWood, { position: [0, 6.15, 0.42] }));
  group.add(mesh(new THREE.TorusGeometry(0.42, 0.06, 8, 28), gold, { position: [0, 6.15, 0.47] }));
  group.add(mesh(new THREE.ConeGeometry(0.24, 0.38, 5), gold, { position: [0, 6.18, 0.54] }));

  for (const x of [-0.32, 0.32]) {
    group.add(
      mesh(new THREE.TorusGeometry(0.13, 0.026, 7, 18), gold, {
        position: [x, 2.15, 0.72],
        scale: [0.72, 1, 1],
      }),
    );
  }
  for (let step = 0; step < 3; step += 1) {
    group.add(
      mesh(new THREE.BoxGeometry(6.2 + step * 0.48, 0.16, 0.7), stone, {
        position: [0, 0.08 + step * 0.08, 0.65 + step * 0.48],
      }),
    );
  }

  const sconces = [addWallSconce(group, -3.42, 3.42, 0.62, palette), addWallSconce(group, 3.42, 3.42, 0.62, palette)];
  const light = new THREE.PointLight(daylight ? 0xffe2ae : 0xffa85a, daylight ? 5 : 15, 9, 1.7);
  light.position.set(0, 4.1, 2.2);
  group.add(light);
  return { group, light, sconces };
}

function createWallAlcove(angle, palette, theme, index) {
  const daylight = theme === 'light';
  const group = new THREE.Group();
  const radius = 12.72;
  group.name = `council-alcove-${index + 1}`;
  group.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
  group.rotation.y = angle + Math.PI;

  const panelColor = index % 2 === 0 ? palette.velvet : palette.plasterDark;
  const panel = material(panelColor, {
    roughness: 0.92,
    emissive: daylight ? 0x000000 : panelColor,
    emissiveIntensity: daylight ? 0 : 0.055,
  });
  const gold = material(palette.gold, { metalness: 0.66, roughness: 0.3 });
  const stone = material(palette.stone, { roughness: 0.94 });
  group.add(mesh(new THREE.BoxGeometry(2.55, 4.45, 0.18), stone, { position: [0, 3.25, 0.04] }));
  group.add(mesh(new THREE.BoxGeometry(2.18, 4.05, 0.12), gold, { position: [0, 3.25, 0.19] }));
  group.add(mesh(new THREE.BoxGeometry(1.94, 3.79, 0.12), panel, { position: [0, 3.25, 0.28] }));
  group.add(mesh(new THREE.BoxGeometry(2.8, 0.18, 0.62), stone, { position: [0, 1.04, 0.32] }));
  group.add(mesh(new THREE.TorusGeometry(0.48, 0.055, 8, 28), gold, { position: [0, 3.6, 0.38] }));
  group.add(mesh(new THREE.ConeGeometry(0.3, 0.76, 7), stone, { position: [0, 3.23, 0.4] }));
  const sconce = addWallSconce(group, 0, 2.06, 0.62, palette);
  return { group, sconce };
}

function addWallSconce(parent, x, y, z, palette, { withLight = false } = {}) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.add(
    mesh(new THREE.BoxGeometry(0.12, 0.58, 0.15), material(palette.bronze, { metalness: 0.7 }), {
      rotation: [0.2, 0, 0],
    }),
  );
  const flames = [];
  for (const offset of [-0.18, 0.18]) {
    group.add(
      mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.38, 8), material(0xd8c49b), { position: [offset, 0.33, 0.16] }),
    );
    const flame = mesh(new THREE.SphereGeometry(0.05, 7, 5), new THREE.MeshBasicMaterial({ color: 0xffb24f }), {
      position: [offset, 0.58, 0.16],
      scale: [0.72, 1.7, 0.72],
      cast: false,
      receive: false,
    });
    group.add(flame);
    flames.push(flame);
  }
  const light = withLight ? new THREE.PointLight(0xff9340, 5, 5, 2) : null;
  if (light) {
    light.position.set(0, 0.52, 0.45);
    group.add(light);
  }
  parent.add(group);
  return { flames, light, baseIntensity: 5, seed: x * 0.7 };
}

function addTableCandle(parent, position, scale, withLight, palette) {
  const group = new THREE.Group();
  group.position.set(...position);
  const wax = material(0xd8c49b, { emissive: 0x3a250e, emissiveIntensity: 0.22 });
  const metal = material(palette.bronze, { metalness: 0.65, roughness: 0.35 });
  group.add(
    mesh(new THREE.CylinderGeometry(0.04 * scale, 0.055 * scale, 0.48 * scale, 8), wax, {
      position: [0, 0.24 * scale, 0],
    }),
  );
  group.add(mesh(new THREE.CylinderGeometry(0.16 * scale, 0.19 * scale, 0.04, 12), metal));
  const flame = mesh(new THREE.SphereGeometry(0.055 * scale, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc15c }), {
    position: [0, 0.54 * scale, 0],
    scale: [0.75, 1.7, 0.75],
    cast: false,
    receive: false,
  });
  group.add(flame);
  const light = withLight ? new THREE.PointLight(0xff9f45, 1.2 * scale, 3.2, 2) : null;
  if (light) {
    light.position.set(0, 0.62 * scale, 0);
    group.add(light);
  }
  parent.add(group);
  return { flames: [flame], light, baseIntensity: 1.2 * scale, seed: position[0] * 0.8 + position[2] };
}

function createChandelier(parent, palette) {
  const group = new THREE.Group();
  group.position.set(0, 6.55, 0.15);
  const bronze = material(palette.bronze, { metalness: 0.78, roughness: 0.26 });
  group.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 8), bronze, { position: [0, 1.45, 0] }));
  group.add(mesh(new THREE.TorusGeometry(1.5, 0.065, 8, 30), bronze, { rotation: [Math.PI / 2, 0, 0] }));
  group.add(mesh(new THREE.CylinderGeometry(0.14, 0.25, 0.7, 10), bronze));
  const candles = [];
  for (let index = 0; index < 10; index += 1) {
    const angle = (Math.PI * 2 * index) / 10;
    const x = Math.sin(angle) * 1.5;
    const z = Math.cos(angle) * 1.5;
    group.add(
      mesh(new THREE.BoxGeometry(0.65, 0.045, 0.055), bronze, {
        position: [x * 0.78, 0, z * 0.78],
        rotation: [0, angle, 0],
      }),
    );
    const candle = addTableCandle(group, [x, 0.02, z], 0.72, false, palette);
    candles.push(candle);
  }
  const glow = new THREE.PointLight(0xffaa55, 18, 12, 2);
  glow.position.set(0, -0.05, 0);
  group.add(glow);
  parent.add(group);
  return { group, candles, glow };
}

function createStatue(x, z, mirrored, palette) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = mirrored ? -0.28 : 0.28;
  const stone = material(palette.stone, { roughness: 1 });
  group.add(mesh(new THREE.BoxGeometry(1.4, 1.25, 1.05), material(palette.marble), { position: [0, 0.63, 0] }));
  group.add(mesh(new THREE.CylinderGeometry(0.52, 0.72, 1.85, 9), stone, { position: [0, 2.03, 0] }));
  group.add(mesh(new THREE.SphereGeometry(0.38, 10, 7), stone, { position: [0, 3.2, 0], scale: [0.88, 1.08, 0.9] }));
  group.add(mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.32, 9), stone, { position: [0, 3.52, 0] }));
  const arm = mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.35, 7), stone, {
    position: [mirrored ? -0.58 : 0.58, 2.43, 0],
    rotation: [0, 0, mirrored ? -0.62 : 0.62],
  });
  group.add(arm);
  return group;
}

function createMedallion(role, index, theme) {
  const plane = mesh(
    new THREE.CircleGeometry(0.62, 28),
    new THREE.MeshBasicMaterial({ map: createMedallionTexture(role, theme), transparent: true }),
    {
      position: [-5 + index * 2.5, 7.05, -10.34],
      cast: false,
      receive: false,
    },
  );
  return plane;
}

function createDust(parent) {
  const random = mulberry32(72);
  const count = 180;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (random() - 0.5) * 18;
    positions[index * 3 + 1] = 0.6 + random() * 6.5;
    positions[index * 3 + 2] = (random() - 0.5) * 13;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xe7c98d,
      size: 0.026,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  parent.add(points);
  return points;
}

function createTable(parent, palette, theme) {
  const table = new THREE.Group();
  const top = mesh(new THREE.CylinderGeometry(4.75, 4.85, 0.36, 32), material(palette.wood, { roughness: 0.58 }), {
    position: [0, 1.02, 0],
    cast: true,
  });
  top.scale.z = 0.72;
  table.add(top);
  const marble = mesh(
    new THREE.CylinderGeometry(4.35, 4.35, 0.055, 40),
    material(0xffffff, {
      map: createMarbleTexture(theme),
      roughness: theme === 'light' ? 0.4 : 0.32,
      metalness: 0.04,
    }),
    {
      position: [0, 1.22, 0],
      cast: true,
    },
  );
  marble.scale.z = 0.7;
  table.add(marble);
  const inlay = mesh(
    new THREE.RingGeometry(2.78, 2.84, 48),
    material(palette.gold, { metalness: 0.7, roughness: 0.3 }),
    { position: [0, 1.255, 0], rotation: [-Math.PI / 2, 0, 0] },
  );
  inlay.scale.z = 0.7;
  table.add(inlay);
  const trim = mesh(
    new THREE.TorusGeometry(4.53, 0.09, 8, 40),
    material(palette.gold, { metalness: 0.75, roughness: 0.25 }),
    { position: [0, 1.21, 0], rotation: [Math.PI / 2, 0, 0] },
  );
  trim.scale.y = 0.72;
  table.add(trim);
  for (const [x, z] of [
    [-2.7, -1.55],
    [2.7, -1.55],
    [-2.7, 1.55],
    [2.7, 1.55],
  ]) {
    table.add(
      mesh(new THREE.CylinderGeometry(0.24, 0.34, 1.04, 10), material(palette.woodLight), {
        position: [x, 0.5, z],
      }),
    );
  }
  parent.add(table);
  return table;
}

function createCeiling(parent, palette) {
  const ceiling = new THREE.Group();
  const darkWood = material(palette.wood, { roughness: 0.75 });
  const disk = mesh(new THREE.CircleGeometry(13.2, 48), material(palette.plasterDark, { roughness: 1 }), {
    position: [0, 8.55, 0],
    rotation: [Math.PI / 2, 0, 0],
  });
  ceiling.add(disk);
  for (const radius of [3.2, 6.6, 10.3, 12.6]) {
    ceiling.add(
      mesh(new THREE.TorusGeometry(radius, radius === 12.6 ? 0.22 : 0.12, 7, 48), darkWood, {
        position: [0, 8.42, 0],
        rotation: [Math.PI / 2, 0, 0],
      }),
    );
  }
  for (let index = 0; index < 12; index += 1) {
    const angle = (Math.PI * 2 * index) / 12;
    const beam = mesh(new THREE.BoxGeometry(0.16, 0.2, 12.5), darkWood, {
      position: [Math.sin(angle) * 6.2, 8.4, Math.cos(angle) * 6.2],
      rotation: [0, angle, 0],
    });
    ceiling.add(beam);
  }
  parent.add(ceiling);
}

/** Ambiente nativo de La Corte: arquitetura e atmosfera, sem regras de jogo. */
export function createCoupEnvironment(stage, { theme = 'dark' } = {}) {
  const resolvedTheme = theme === 'light' ? 'light' : 'dark';
  const palette = PALETTES[resolvedTheme];
  const daylight = resolvedTheme === 'light';
  const room = new THREE.Group();
  room.name = 'la-corte-chamber';

  const floorTexture = createFloorTexture(resolvedTheme);
  room.add(
    mesh(new THREE.CircleGeometry(17, 56), material(0xffffff, { map: floorTexture, roughness: 0.66 }), {
      rotation: [-Math.PI / 2, 0, 0],
      cast: false,
    }),
  );
  const carpet = mesh(
    new THREE.CircleGeometry(6.72, 56),
    material(0xffffff, { map: createCarpetTexture(resolvedTheme), roughness: 0.98, metalness: 0 }),
    {
      position: [0, 0.018, 0],
      rotation: [-Math.PI / 2, 0, 0],
      scale: [1, 1, 0.72],
      cast: false,
    },
  );
  room.add(carpet);
  const floorInlay = mesh(new THREE.RingGeometry(6.9, 7.15, 48), material(palette.gold, { metalness: 0.45 }), {
    position: [0, 0.024, 0],
    rotation: [-Math.PI / 2, 0, 0],
    cast: false,
  });
  floorInlay.scale.z = 0.8;
  room.add(floorInlay);

  const plasterTexture = createPlasterTexture(resolvedTheme);
  const chamberWall = mesh(
    new THREE.CylinderGeometry(13.4, 13.4, 8.6, 40, 1, true),
    material(0xffffff, { map: plasterTexture, roughness: 1, side: THREE.BackSide }),
    { position: [0, 4.25, 0], cast: false },
  );
  room.add(chamberWall);
  room.add(
    mesh(
      new THREE.CylinderGeometry(13.1, 13.1, 2.05, 40, 1, true),
      material(palette.wood, { roughness: 0.72, side: THREE.BackSide }),
      { position: [0, 1.02, 0], cast: false },
    ),
  );
  for (const y of [2.05, 7.65]) {
    room.add(
      mesh(new THREE.TorusGeometry(13.08, y > 7 ? 0.18 : 0.12, 8, 64), material(palette.gold, { metalness: 0.56 }), {
        position: [0, y, 0],
        rotation: [Math.PI / 2, 0, 0],
      }),
    );
  }

  const featureWall = mesh(new THREE.BoxGeometry(22.4, 8.5, 0.5), material(palette.plasterDark, { roughness: 1 }), {
    position: [0, 4.15, -10.82],
  });
  room.add(featureWall);
  for (const [index, x] of [-5.75, 5.75].entries()) room.add(createWindow(index, x, palette, resolvedTheme));
  const centralPanel = new THREE.Group();
  centralPanel.name = 'court-seal-panel';
  centralPanel.position.set(0, 0, -10.5);
  const panelWidth = 5.8;
  const panelHeight = 4.55;
  const panelY = 4.05;
  const panelSurface = material(palette.plasterDark, {
    roughness: 0.92,
    emissive: daylight ? 0x000000 : 0x2a1d16,
    emissiveIntensity: daylight ? 0 : 0.12,
  });
  const panelGold = material(palette.gold, { metalness: 0.66, roughness: 0.3 });
  centralPanel.add(
    mesh(new THREE.BoxGeometry(panelWidth, panelHeight, 0.12), panelSurface, {
      position: [0, panelY, 0],
    }),
  );
  for (const x of [-panelWidth / 2, panelWidth / 2]) {
    centralPanel.add(
      mesh(new THREE.BoxGeometry(0.12, panelHeight + 0.2, 0.08), panelGold, {
        position: [x, panelY, 0.11],
      }),
    );
  }
  for (const y of [panelY - panelHeight / 2, panelY + panelHeight / 2]) {
    centralPanel.add(
      mesh(new THREE.BoxGeometry(panelWidth + 0.12, 0.12, 0.08), panelGold, {
        position: [0, y, 0.11],
      }),
    );
  }
  centralPanel.add(
    mesh(
      new THREE.PlaneGeometry(2.85, 2.85),
      new THREE.MeshBasicMaterial({
        map: createCourtSealTexture(resolvedTheme),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
      { position: [0, panelY + 0.04, 0.17], cast: false, receive: false },
    ),
  );
  room.add(centralPanel);
  for (const x of [-7.85, -2.7, 2.7, 7.85])
    room.add(createColumn(x, -10.12, x === -7.85 || x === 7.85 ? 1.05 : 0.86, palette));

  ROLE_SIGILS.forEach((role, index) => room.add(createMedallion(role, index, resolvedTheme)));
  room.add(createStatue(-10.3, -8.65, false, palette));
  room.add(createStatue(10.3, -8.65, true, palette));
  const grandDoor = createGrandDoor(palette, resolvedTheme);
  room.add(grandDoor.group);
  const alcoves = [-1.45, -0.82, 0.82, 1.45].map((angle, index) =>
    createWallAlcove(angle, palette, resolvedTheme, index),
  );
  alcoves.forEach((alcove) => room.add(alcove.group));

  createCeiling(room, palette);
  const chandelier = createChandelier(room, palette);
  const table = createTable(room, palette, resolvedTheme);
  const tableCandles = [
    addTableCandle(room, [-3.6, 1.25, -1.75], 0.92, false, palette),
    addTableCandle(room, [3.6, 1.25, -1.75], 0.92, false, palette),
    addTableCandle(room, [-3.2, 1.25, 1.85], 0.78, false, palette),
    addTableCandle(room, [3.2, 1.25, 1.85], 0.78, false, palette),
  ];
  const sconces = [addWallSconce(room, -7.2, 4.25, -10.02, palette), addWallSconce(room, 7.2, 4.25, -10.02, palette)];
  const flames = [
    ...tableCandles,
    ...chandelier.candles,
    ...sconces,
    ...grandDoor.sconces,
    ...alcoves.map((alcove) => alcove.sconce),
  ];
  const dust = createDust(room);

  const ambient = new THREE.HemisphereLight(daylight ? 0xf4e5c4 : 0xe2c79c, daylight ? 0x685a48 : 0x38271e, 1);
  room.add(ambient);
  const key = new THREE.SpotLight(daylight ? 0xffe8bd : 0xffd69a, 54, 22, 0.74, 0.65, 1.6);
  key.position.set(0, 8.2, 2.8);
  key.target.position.set(0, 0.8, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  room.add(key, key.target);
  const windowFill = new THREE.DirectionalLight(daylight ? 0xcbe2e8 : 0x6a78a8, daylight ? 4.8 : 2.4);
  windowFill.position.set(-4, 5.5, -9.5);
  room.add(windowFill);
  const cameraFill = new THREE.DirectionalLight(daylight ? 0xffefd5 : 0xe8bd87, daylight ? 2.2 : 4.6);
  cameraFill.position.set(0, 5.8, 8.5);
  cameraFill.target.position.set(0, 2.1, -4.8);
  room.add(cameraFill, cameraFill.target);
  const wallWashers = [];
  const sunset = new THREE.PointLight(daylight ? 0xf1c884 : 0xd46b47, 12, 13, 2);
  sunset.position.set(0, 4.2, -8.8);
  room.add(sunset);
  stage.add(room);

  return {
    room,
    table,
    key,
    ambient,
    cameraFill,
    wallWashers,
    sunset,
    dust,
    carpet,
    chandelier,
    grandDoor,
    alcoves,
    flames,
    setMood(beat) {
      const victory = beat === 'victory';
      const danger = ['claim', 'block-claim', 'influence-loss'].includes(beat);
      key.intensity = daylight ? (victory ? 72 : danger ? 82 : 92) : victory ? 42 : danger ? 68 : 76;
      ambient.intensity = daylight ? (victory ? 1.85 : 2.35) : victory ? 1.8 : danger ? 2.5 : 2.25;
      cameraFill.intensity = daylight ? (victory ? 1.8 : 2.2) : victory ? 4.2 : danger ? 5.4 : 4.8;
      wallWashers.forEach((light) => {
        light.intensity = daylight ? (danger ? 4.8 : 3.5) : victory ? 8 : danger ? 14 : 11;
      });
      grandDoor.light.intensity = daylight ? (danger ? 6.5 : 5) : victory ? 11 : danger ? 18 : 15;
      sunset.intensity = daylight ? (victory ? 12 : danger ? 18 : 16) : victory ? 7 : danger ? 12 : 10;
      sunset.color.setHex(danger ? 0xa64d3e : daylight ? 0xf1c884 : 0xd46b47);
      chandelier.glow.intensity = daylight ? (victory ? 5 : 3) : victory ? 13 : 22;
    },
    update(elapsed, reducedMotion) {
      for (const candle of flames) {
        const flicker = reducedMotion
          ? 1
          : 0.9 + Math.sin(elapsed * 8.7 + candle.seed) * 0.07 + Math.sin(elapsed * 16.3) * 0.025;
        for (const flame of candle.flames) flame.scale.y = 1.7 * flicker;
        if (candle.light) candle.light.intensity = candle.baseIntensity * flicker;
      }
      dust.rotation.y = reducedMotion ? 0 : elapsed * 0.012;
      dust.position.y = reducedMotion ? 0 : Math.sin(elapsed * 0.12) * 0.08;
      chandelier.group.rotation.y = reducedMotion ? 0 : Math.sin(elapsed * 0.18) * 0.012;
    },
  };
}
