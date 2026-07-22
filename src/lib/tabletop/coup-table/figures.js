import * as THREE from 'three';
import { COLORS, mesh, standardMaterial } from './primitives.js';
import { ROBES, ROLE_COLORS } from './visual-theme.js';

export function createNoble(index) {
  const group = new THREE.Group();
  const robeColor = ROBES[index % ROBES.length];
  const robe = standardMaterial(robeColor, { roughness: 0.92, emissive: robeColor, emissiveIntensity: 0.035 });
  const skin = standardMaterial(index % 3 === 0 ? 0xa46f55 : index % 3 === 1 ? 0x6e4939 : 0xc19171);
  const dark = standardMaterial(0x28201b, { roughness: 0.9 });
  const gold = standardMaterial(COLORS.gold, { metalness: 0.72, roughness: 0.28 });
  const chairWood = standardMaterial(COLORS.wood, { roughness: 0.76 });
  const chairWoodLight = standardMaterial(COLORS.woodLight, { roughness: 0.72 });
  const chairVelvet = standardMaterial(robeColor, {
    roughness: 0.96,
    emissive: robeColor,
    emissiveIntensity: 0.025,
  });

  const chair = new THREE.Group();
  chair.add(mesh(new THREE.BoxGeometry(1.42, 1.75, 0.18), chairWood, { position: [0, 1.05, 0.42] }));
  chair.add(mesh(new THREE.BoxGeometry(1.15, 0.18, 1.18), chairWoodLight, { position: [0, 0.56, 0.05] }));
  chair.add(
    mesh(new THREE.BoxGeometry(1.08, 1.28, 0.055), chairVelvet, {
      position: [0, 1.1, 0.315],
      cast: false,
    }),
  );
  chair.add(
    mesh(new THREE.BoxGeometry(1.02, 0.055, 0.94), chairVelvet, {
      position: [0, 0.675, 0],
      cast: false,
    }),
  );
  chair.add(
    mesh(new THREE.BoxGeometry(1.52, 0.105, 0.23), gold, {
      position: [0, 1.95, 0.42],
      cast: false,
    }),
  );
  for (const x of [-0.52, 0.52]) {
    for (const z of [-0.43, 0.43]) {
      chair.add(
        mesh(new THREE.CylinderGeometry(0.065, 0.095, 0.66, 7), chairWood, {
          position: [x, 0.27, z],
          rotation: [z < 0 ? x * 0.08 : 0, 0, x * 0.055],
          cast: false,
        }),
      );
    }
  }
  group.add(chair);

  const body = new THREE.Group();
  body.name = 'noble-body';
  body.add(mesh(new THREE.CylinderGeometry(0.44, 0.72, 1.3, 8), robe, { position: [0, 1.2, 0] }));
  body.add(mesh(new THREE.SphereGeometry(0.34, 12, 8), skin, { position: [0, 2.08, -0.03], scale: [0.9, 1.08, 0.88] }));
  body.add(mesh(new THREE.SphereGeometry(0.35, 12, 8), dark, { position: [0, 2.31, 0.04], scale: [1.03, 0.55, 1] }));
  body.add(mesh(new THREE.TorusGeometry(0.42, 0.055, 7, 16), gold, { position: [0, 1.82, 0.22], scale: [1, 0.52, 1] }));
  for (const x of [-0.31, 0.31]) {
    body.add(
      mesh(new THREE.SphereGeometry(0.045, 6, 5), new THREE.MeshBasicMaterial({ color: 0x130b08 }), {
        position: [x * 0.42, 2.13, -0.31],
        cast: false,
      }),
    );
  }
  group.add(body);

  const focus = mesh(
    new THREE.RingGeometry(0.82, 1.02, 28),
    new THREE.MeshBasicMaterial({
      color: COLORS.gold,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    { position: [0, 0.035, 0], rotation: [-Math.PI / 2, 0, 0], cast: false, receive: false },
  );
  focus.visible = false;
  group.add(focus);
  return { group, body, focus, robe };
}

export const ROLE_VISUALS = {
  Duque: {
    coat: 0x17191c,
    accent: 0x5d2026,
    hair: 0xd5cfc1,
    skin: 0xb57e5d,
  },
  Assassina: {
    coat: 0x202020,
    accent: 0x6f1f27,
    hair: 0x171310,
    skin: 0xb47a5c,
  },
  Capitão: {
    coat: 0x172936,
    accent: 0x176074,
    hair: 0x211914,
    skin: 0x9f694d,
  },
  Embaixadora: {
    coat: 0x17493e,
    accent: 0xe2d6be,
    hair: 0x2b211b,
    skin: 0xad7a5e,
  },
  Condessa: {
    coat: 0x211b20,
    accent: 0x70263a,
    hair: 0x211714,
    skin: 0xa96f55,
  },
};

function addFigureButton(parent, x, y, z, gold) {
  parent.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), gold, { position: [x, y, z] }));
}

/** Retrato volumétrico de um papel público, derivado das cinco pinturas 2D. */
export function createRoleFigure(role) {
  const visual = ROLE_VISUALS[role];
  if (!visual) return null;
  const figure = new THREE.Group();
  figure.name = `public-role-${role.toLowerCase()}`;
  const coat = standardMaterial(visual.coat, {
    roughness: 0.82,
    emissive: visual.coat,
    emissiveIntensity: 0.055,
  });
  const accent = standardMaterial(visual.accent, {
    roughness: 0.8,
    emissive: visual.accent,
    emissiveIntensity: 0.065,
  });
  const skin = standardMaterial(visual.skin, { roughness: 0.88 });
  const hair = standardMaterial(visual.hair, { roughness: 0.94 });
  const gold = standardMaterial(COLORS.gold, { metalness: 0.7, roughness: 0.3 });
  const ivory = standardMaterial(0xe3d8c3, { roughness: 0.9 });
  const black = standardMaterial(0x171411, { roughness: 0.9 });

  figure.add(
    mesh(new THREE.CylinderGeometry(0.62, 0.78, 0.22, 18), standardMaterial(COLORS.woodLight), {
      position: [0, 0.12, 0],
    }),
  );
  figure.add(
    mesh(new THREE.CylinderGeometry(0.5, 0.64, 1.45, 12), coat, { position: [0, 0.93, 0], scale: [1, 1, 0.66] }),
  );
  figure.add(
    mesh(new THREE.SphereGeometry(0.38, 16, 10), skin, { position: [0, 1.84, 0.02], scale: [0.86, 1.08, 0.8] }),
  );
  figure.add(
    mesh(new THREE.SphereGeometry(0.385, 14, 9), hair, { position: [0, 2.02, -0.055], scale: [0.94, 0.72, 0.82] }),
  );
  figure.add(mesh(new THREE.BoxGeometry(0.38, 0.14, 0.16), skin, { position: [0, 1.65, 0.23] }));
  for (const x of [-0.12, 0.12]) {
    figure.add(
      mesh(new THREE.SphereGeometry(0.027, 7, 5), new THREE.MeshBasicMaterial({ color: 0x1a120e }), {
        position: [x, 1.91, 0.31],
        cast: false,
      }),
    );
  }
  for (const x of [-0.47, 0.47]) {
    figure.add(
      mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.92, 8), coat, {
        position: [x, 1.02, 0],
        rotation: [0, 0, x < 0 ? -0.16 : 0.16],
      }),
    );
  }

  if (role === 'Duque') {
    figure.add(
      mesh(new THREE.BoxGeometry(0.92, 0.72, 0.13), accent, {
        position: [-0.25, 1.22, -0.2],
        rotation: [0, 0.16, 0.08],
      }),
    );
    figure.add(
      mesh(new THREE.CylinderGeometry(0.23, 0.28, 0.25, 10), hair, {
        position: [0, 1.59, 0.15],
        rotation: [Math.PI / 2, 0, 0],
      }),
    );
    figure.add(
      mesh(new THREE.TorusGeometry(0.39, 0.035, 7, 18), gold, { position: [0, 1.42, 0.39], scale: [1, 0.56, 1] }),
    );
    figure.add(
      mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12), gold, {
        position: [0, 1.23, 0.42],
        rotation: [Math.PI / 2, 0, 0],
      }),
    );
  }

  if (role === 'Assassina') {
    const veil = standardMaterial(0x171411, {
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    figure.add(mesh(new THREE.PlaneGeometry(0.92, 1.34), veil, { position: [0, 1.54, -0.22] }));
    figure.add(
      mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.78, 8), black, {
        position: [0.48, 0.76, 0.38],
        rotation: [0, 0, -0.3],
      }),
    );
    figure.add(
      mesh(new THREE.ConeGeometry(0.1, 0.4, 4), gold, { position: [0.6, 1.25, 0.38], rotation: [0, 0, -0.3] }),
    );
    figure.add(
      mesh(new THREE.TorusGeometry(0.38, 0.04, 7, 18), gold, { position: [0, 1.35, 0.37], scale: [1, 0.6, 1] }),
    );
  }

  if (role === 'Capitão') {
    for (const x of [-0.3, 0.3]) {
      figure.add(
        mesh(new THREE.BoxGeometry(0.34, 0.82, 0.075), accent, {
          position: [x, 1.14, 0.35],
          rotation: [0, 0, x < 0 ? -0.19 : 0.19],
        }),
      );
      figure.add(
        mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 12), gold, {
          position: [x * 1.45, 1.56, 0],
          rotation: [0, 0, Math.PI / 2],
        }),
      );
    }
    for (const y of [0.83, 1.05, 1.27, 1.49]) {
      addFigureButton(figure, -0.18, y, 0.41, gold);
      addFigureButton(figure, 0.18, y, 0.41, gold);
    }
    figure.add(
      mesh(new THREE.BoxGeometry(0.66, 0.13, 0.13), ivory, { position: [0, 1.54, 0.27], rotation: [0.24, 0, 0] }),
    );
  }

  if (role === 'Embaixadora') {
    figure.add(
      mesh(new THREE.CylinderGeometry(0.42, 0.55, 1.18, 12), ivory, { position: [0, 1.05, 0], scale: [1, 1, 0.67] }),
    );
    figure.add(
      mesh(new THREE.BoxGeometry(0.82, 0.17, 0.07), gold, { position: [0, 1.34, 0.38], rotation: [0, 0, -0.03] }),
    );
    const letter = mesh(new THREE.BoxGeometry(0.62, 0.42, 0.035), ivory, {
      position: [0.25, 0.9, 0.52],
      rotation: [0, 0.18, -0.14],
    });
    figure.add(letter);
    figure.add(
      mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.035, 12), standardMaterial(0x2f725a), {
        position: [0.25, 0.9, 0.55],
        rotation: [Math.PI / 2, 0, 0],
      }),
    );
  }

  if (role === 'Condessa') {
    figure.add(
      mesh(new THREE.TorusGeometry(0.48, 0.11, 8, 24, Math.PI * 1.2), accent, {
        position: [0, 1.77, -0.08],
        rotation: [0, 0, -Math.PI * 0.1],
        scale: [1, 1.2, 1],
      }),
    );
    figure.add(mesh(new THREE.BoxGeometry(0.7, 1.2, 0.12), accent, { position: [0, 1.0, 0.35], scale: [1, 1, 1] }));
    for (const x of [-0.18, 0, 0.18]) addFigureButton(figure, x, 2.26 - Math.abs(x) * 0.5, 0.05, gold);
    figure.add(
      mesh(new THREE.TorusGeometry(0.28, 0.032, 7, 16), gold, { position: [0, 1.46, 0.41], scale: [1, 0.55, 1] }),
    );
  }

  figure.add(
    mesh(
      new THREE.RingGeometry(0.58, 0.72, 28),
      new THREE.MeshBasicMaterial({
        color: ROLE_COLORS[role],
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      { position: [0, 0.24, 0], rotation: [-Math.PI / 2, 0, 0], cast: false, receive: false },
    ),
  );
  return figure;
}

/** Figura neutra de intervenção: não insinua nenhuma carta privada. */
export function createInterventionFigure(kind) {
  const challenge = kind === 'challenge';
  const figure = new THREE.Group();
  figure.name = challenge ? 'intervention-challenge' : 'intervention-allow';
  const accentColor = challenge ? COLORS.danger : COLORS.gold;
  const stone = standardMaterial(challenge ? 0x372126 : 0x3b352b, {
    roughness: 0.78,
    emissive: challenge ? 0x2a0c10 : 0x302814,
    emissiveIntensity: 0.12,
  });
  const accent = standardMaterial(accentColor, {
    metalness: 0.72,
    roughness: 0.28,
    emissive: accentColor,
    emissiveIntensity: 0.12,
  });
  const dark = standardMaterial(0x171411, { roughness: 0.9 });

  figure.add(mesh(new THREE.CylinderGeometry(0.56, 0.7, 0.2, 18), dark, { position: [0, 0.1, 0] }));
  figure.add(mesh(new THREE.CylinderGeometry(0.43, 0.62, 1.22, 10), stone, { position: [0, 0.78, 0] }));
  figure.add(mesh(new THREE.SphereGeometry(0.3, 14, 9), stone, { position: [0, 1.58, 0.02] }));
  figure.add(
    mesh(new THREE.BoxGeometry(0.68, 0.16, 0.1), accent, {
      position: [0, 1.02, 0.4],
      rotation: [0.08, 0, challenge ? -0.17 : 0],
    }),
  );

  if (challenge) {
    for (const direction of [-1, 1]) {
      figure.add(
        mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.05, 7), accent, {
          position: [direction * 0.16, 1.18, 0.42],
          rotation: [0, 0, direction * 0.72],
        }),
      );
    }
  } else {
    figure.add(
      mesh(new THREE.TorusGeometry(0.33, 0.045, 8, 22, Math.PI * 1.55), accent, {
        position: [0, 1.25, 0.38],
        rotation: [0, 0, -Math.PI * 0.78],
      }),
    );
  }

  figure.add(
    mesh(
      new THREE.RingGeometry(0.54, 0.69, 28),
      new THREE.MeshBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      { position: [0, 0.22, 0], rotation: [-Math.PI / 2, 0, 0], cast: false, receive: false },
    ),
  );
  return figure;
}
