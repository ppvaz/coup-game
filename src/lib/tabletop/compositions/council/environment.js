import * as THREE from 'three';
import { mesh, standardMaterial } from '../../coup-table/primitives.js';

const PALETTES = {
  dark: {
    background: 0x0c0a09,
    floor: 0x1a1512,
    backdrop: 0x1d1714,
    wood: 0x4c2d1e,
    felt: 0x3a3128,
    edge: 0xc39a55,
    light: 0xffdfaa,
    ambient: 0x8b7760,
  },
  light: {
    background: 0x74695c,
    floor: 0x817363,
    backdrop: 0x9a8974,
    wood: 0x5c3420,
    felt: 0x4a4237,
    edge: 0xd2ad65,
    light: 0xffe6b7,
    ambient: 0xd7c6aa,
  },
};

/**
 * Medidas do tampo redondo. O anel de assentos e as peças de cada cortesão
 * derivam daqui: sem isso, cadeira, carta e moeda pousavam em raios diferentes
 * e a metade delas terminava fora do feltro.
 */
export const COUNCIL_TABLE = Object.freeze({
  radius: 4.7,
  top: 1.22,
  feltRadius: 4.34,
  feltTop: 1.2675,
  rimRadius: 4.5,
  rimHeight: 1.285,
});

export const COUNCIL_THEME_PROFILES = {
  dark: {
    clearColor: PALETTES.dark.background,
    fogColor: PALETTES.dark.background,
    fogDensity: 0.028,
    exposure: 1.24,
    grain: 0.012,
    vignette: 0.5,
  },
  light: {
    clearColor: PALETTES.light.background,
    fogColor: PALETTES.light.background,
    fogDensity: 0.035,
    exposure: 1.08,
    grain: 0.006,
    vignette: 0.38,
  },
};

export function createCouncilEnvironment(stage, { theme = 'dark' } = {}) {
  const resolvedTheme = theme === 'light' ? 'light' : 'dark';
  const palette = PALETTES[resolvedTheme];
  const room = new THREE.Group();
  room.name = 'council-minimal-environment';

  const floorMaterial = standardMaterial(palette.floor, { roughness: 0.96 });
  room.add(
    mesh(new THREE.CircleGeometry(12.5, 48), floorMaterial, {
      position: [0, -0.015, 0],
      rotation: [-Math.PI / 2, 0, 0],
      cast: false,
    }),
  );

  room.add(
    mesh(
      new THREE.CylinderGeometry(11.6, 11.6, 7.2, 48, 1, true),
      standardMaterial(palette.backdrop, { roughness: 1, side: THREE.BackSide }),
      { position: [0, 3.3, 0], cast: false, receive: false },
    ),
  );

  // Seis linhas verticais sugerem o salão; o vazio continua sendo o cenário.
  // O meio passo evita que uma coluna caia sobre o eixo radial de um assento —
  // é por esse eixo que passam a câmera da mesa e todos os POVs.
  const columnMaterial = standardMaterial(palette.backdrop, { roughness: 0.92 });
  for (let index = 0; index < 6; index += 1) {
    const angle = ((index + 0.5) / 6) * Math.PI * 2;
    room.add(
      mesh(new THREE.CylinderGeometry(0.16, 0.22, 5.7, 8), columnMaterial, {
        position: [Math.sin(angle) * 9.3, 2.75, Math.cos(angle) * 9.3],
        cast: false,
      }),
    );
  }

  const table = new THREE.Group();
  table.name = 'council-table';
  table.add(
    mesh(
      new THREE.CylinderGeometry(COUNCIL_TABLE.radius, COUNCIL_TABLE.radius + 0.08, 0.3, 40),
      standardMaterial(palette.wood, { roughness: 0.7 }),
      { position: [0, COUNCIL_TABLE.top - 0.15, 0] },
    ),
  );
  table.add(
    mesh(
      new THREE.CylinderGeometry(COUNCIL_TABLE.feltRadius, COUNCIL_TABLE.feltRadius, 0.045, 48),
      standardMaterial(palette.felt, { roughness: 0.94 }),
      { position: [0, COUNCIL_TABLE.feltTop - 0.0225, 0], cast: false },
    ),
  );
  const accentMaterial = standardMaterial(palette.edge, {
    emissive: palette.edge,
    emissiveIntensity: resolvedTheme === 'light' ? 0.025 : 0.1,
    metalness: 0.55,
    roughness: 0.34,
  });
  table.add(
    mesh(new THREE.TorusGeometry(COUNCIL_TABLE.rimRadius, 0.035, 7, 64), accentMaterial, {
      position: [0, COUNCIL_TABLE.rimHeight, 0],
      rotation: [Math.PI / 2, 0, 0],
      cast: false,
    }),
  );
  table.add(
    mesh(new THREE.CylinderGeometry(1.05, 1.45, 1.1, 16), standardMaterial(palette.wood, { roughness: 0.78 }), {
      position: [0, 0.47, 0],
    }),
  );
  room.add(table);

  const lamp = new THREE.Group();
  lamp.name = 'council-lamp';
  lamp.position.set(0, 7.35, 0);
  lamp.add(
    mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.1, 6), standardMaterial(0x100d0b), {
      position: [0, 1.0, 0],
      cast: false,
    }),
  );
  lamp.add(
    mesh(new THREE.ConeGeometry(0.58, 0.34, 12, 1, true), standardMaterial(palette.wood), {
      position: [0, -0.08, 0],
      rotation: [Math.PI, 0, 0],
      cast: false,
    }),
  );
  lamp.add(
    mesh(
      new THREE.SphereGeometry(0.12, 10, 7),
      new THREE.MeshBasicMaterial({ color: palette.light, toneMapped: false }),
      { position: [0, -0.25, 0], cast: false, receive: false },
    ),
  );
  room.add(lamp);

  const ambient = new THREE.HemisphereLight(palette.ambient, palette.floor, resolvedTheme === 'light' ? 2.2 : 2.6);
  // A luminária é a única fonte diegética. Do alto dela até a borda do tampo há
  // 45° e quase oito unidades: com cone estreito, penumbra larga ou queda
  // quadrática, a metade próxima aos olhos afunda no preto. Daí o ângulo aberto
  // e a queda quase linear.
  const key = new THREE.SpotLight(palette.light, resolvedTheme === 'light' ? 62 : 82, 22, 1.15, 0.35, 1.05);
  key.position.set(0, 6.7, 0.8);
  key.target.position.set(0, 1.1, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const fill = new THREE.DirectionalLight(palette.ambient, resolvedTheme === 'light' ? 2.1 : 3.4);
  fill.position.set(0, 4.5, 8);
  fill.target.position.set(0, 1.5, 0);
  room.add(ambient, key, key.target, fill, fill.target);
  stage.add(room);

  return {
    room,
    table,
    key,
    ambient,
    baseKeyIntensity: key.intensity,
    setMood(beat) {
      const danger = ['claim', 'block-claim', 'influence-loss'].includes(beat);
      const victory = beat === 'victory';
      const accent = danger ? 0xb63a3c : victory ? 0xeee6d6 : palette.edge;
      accentMaterial.color.setHex(accent);
      accentMaterial.emissive.setHex(accent);
      accentMaterial.emissiveIntensity = danger ? 0.34 : victory ? 0.2 : resolvedTheme === 'light' ? 0.025 : 0.1;
      key.color.setHex(danger ? 0xffc0aa : palette.light);
      this.baseKeyIntensity = resolvedTheme === 'light' ? (danger ? 72 : 62) : danger ? 95 : victory ? 68 : 82;
      key.intensity = this.baseKeyIntensity;
    },
    update(elapsed, reducedMotion) {
      lamp.rotation.z = reducedMotion ? 0 : Math.sin(elapsed * 0.42) * 0.012;
      key.intensity = this.baseKeyIntensity + (reducedMotion ? 0 : Math.sin(elapsed * 7.7) * 0.035);
    },
  };
}
