import * as THREE from 'three';
import { TabletopStage, canvasTexture, disposeObject3D, textTexture } from '@la-corte/tabletop-stage';
import { createCoupEnvironment } from './coup-environment.js';
import { resolveTabletopQuality } from './quality-profiles.js';
import duquePortrait from '../../../assets/characters/duque.png';
import assassinaPortrait from '../../../assets/characters/assassina.png';
import capitaoPortrait from '../../../assets/characters/capitao.png';
import embaixadoraPortrait from '../../../assets/characters/embaixadora.png';
import condessaPortrait from '../../../assets/characters/condessa.png';
import incomeArt from '../../../assets/actions/income.png';
import foreignAidArt from '../../../assets/actions/foreign-aid.png';
import taxArt from '../../../assets/actions/tax.png';
import stealArt from '../../../assets/actions/steal.png';
import exchangeArt from '../../../assets/actions/exchange.png';
import assassinateArt from '../../../assets/actions/assassinate.png';
import coupArt from '../../../assets/actions/coup.png';

const COLORS = {
  ink: 0x080706,
  wood: 0x24130d,
  woodLight: 0x4b2c1d,
  velvet: 0x401617,
  velvetDark: 0x19090a,
  gold: 0xd9b56b,
  ivory: 0xeee6d6,
  bronze: 0x765329,
  danger: 0xb63a3c,
};

const ROBES = [0x52252c, 0x1e3a45, 0x3e3821, 0x352547, 0x23372b, 0x473221];
const ROLE_COLORS = {
  Duque: '#b69255',
  Assassina: '#8f2930',
  Capitão: '#286b7d',
  Embaixadora: '#34765f',
  Condessa: '#7a3044',
};

const ROLE_CARD_ACCENTS = {
  Duque: '#e0bc74',
  Assassina: '#dc6670',
  Capitão: '#71c2d3',
  Embaixadora: '#69bd9a',
  Condessa: '#c9758e',
};

const ROLE_PORTRAITS = {
  Duque: duquePortrait,
  Assassina: assassinaPortrait,
  Capitão: capitaoPortrait,
  Embaixadora: embaixadoraPortrait,
  Condessa: condessaPortrait,
};

const ACTION_ART = {
  income: incomeArt,
  foreign_aid: foreignAidArt,
  tax: taxArt,
  steal: stealArt,
  exchange: exchangeArt,
  assassinate: assassinateArt,
  coup: coupArt,
};

const THEME_PROFILES = {
  dark: {
    clearColor: 0x171411,
    fogColor: 0x211b17,
    fogDensity: 0.018,
    exposure: 1.36,
    grain: 0.015,
    vignette: 0.38,
  },
  light: {
    clearColor: 0xb8a78e,
    fogColor: 0xc9b99f,
    fogDensity: 0.018,
    exposure: 1.12,
    grain: 0.008,
    vignette: 0.34,
  },
};

function standardMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.08, ...options });
}

function mesh(geometry, material, { position, rotation, scale, cast = true, receive = true } = {}) {
  const value = new THREE.Mesh(geometry, material);
  if (position) value.position.set(...position);
  if (rotation) value.rotation.set(...rotation);
  if (scale) value.scale.set(...scale);
  value.castShadow = cast;
  value.receiveShadow = receive;
  return value;
}

function plaqueTexture(name, subtitle, accent = '#d9b56b') {
  return canvasTexture(
    (context, canvas) => {
      context.fillStyle = '#100c09';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = accent;
      context.lineWidth = 8;
      context.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
      context.textAlign = 'center';
      context.fillStyle = '#eee6d6';
      context.font = "600 48px 'Cormorant Garamond', serif";
      context.fillText(String(name).toUpperCase(), canvas.width / 2, 72);
      context.fillStyle = accent;
      context.font = "700 18px 'DM Sans', sans-serif";
      context.fillText(String(subtitle).toUpperCase(), canvas.width / 2, 108);
    },
    { width: 512, height: 128 },
  );
}

function influenceTexture(influence) {
  if (!influence.role) {
    return textTexture({
      title: 'LA CORTE',
      kicker: 'INFLUÊNCIA',
      footer: 'SIGILO ABSOLUTO',
      background: influence.revealed ? '#17120e' : '#26130f',
      accent: influence.revealed ? '#6f6151' : '#d9b56b',
      width: 320,
      height: 448,
    });
  }
  const texture = new THREE.TextureLoader().load(ROLE_PORTRAITS[influence.role]);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function influenceLabelTexture(influence) {
  return canvasTexture(
    (context, canvas) => {
      const accent = influence.revealed ? '#756b5f' : (ROLE_COLORS[influence.role] ?? '#d9b56b');
      const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, 'rgba(12,9,7,.12)');
      gradient.addColorStop(0.28, 'rgba(12,9,7,.86)');
      gradient.addColorStop(1, 'rgba(12,9,7,.98)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = accent;
      context.fillRect(0, canvas.height - 8, canvas.width, 8);
      context.textAlign = 'center';
      context.fillStyle = influence.revealed ? '#a49b8e' : '#f0e6d3';
      context.font = "600 38px 'Cormorant Garamond', serif";
      context.fillText(influence.role.toUpperCase(), canvas.width / 2, 57);
      context.fillStyle = accent;
      context.font = "700 13px 'DM Sans', sans-serif";
      context.fillText(influence.revealed ? 'INFLUÊNCIA REVELADA' : 'INFLUÊNCIA', canvas.width / 2, 82);
    },
    { width: 320, height: 96 },
  );
}

function imageTexture(source) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const context = canvas.getContext('2d');
  context.fillStyle = '#18130f';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;

  const image = new Image();
  image.addEventListener('load', () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.filter = 'brightness(155%) contrast(88%) saturate(110%)';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.filter = 'none';
    context.globalCompositeOperation = 'screen';
    context.fillStyle = 'rgba(255,238,210,.085)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'source-over';
    texture.needsUpdate = true;
  });
  image.src = source;
  return texture;
}

function actionCaptionTexture(title, kicker, footer, accent) {
  return canvasTexture(
    (context, canvas) => {
      const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, 'rgba(10,8,7,.08)');
      gradient.addColorStop(0.22, 'rgba(10,8,7,.9)');
      gradient.addColorStop(1, 'rgba(10,8,7,.99)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = accent;
      context.fillRect(0, canvas.height - 10, canvas.width, 10);
      context.textAlign = 'center';
      context.fillStyle = accent;
      context.font = "700 15px 'DM Sans', sans-serif";
      context.shadowColor = 'rgba(0,0,0,.95)';
      context.shadowBlur = 5;
      context.fillText(kicker.toUpperCase(), canvas.width / 2, 38);
      context.shadowBlur = 0;
      context.fillStyle = '#f0e6d3';
      context.font = "600 48px 'Cormorant Garamond', serif";
      context.fillText(String(title).toUpperCase(), canvas.width / 2, 91);
      context.fillStyle = 'rgba(240,230,211,.72)';
      context.font = "600 14px 'DM Sans', sans-serif";
      context.fillText(footer.toUpperCase(), canvas.width / 2, 126);
    },
    { width: 384, height: 148 },
  );
}

function faceCameraYaw(object, camera, delta, offset = 0) {
  const target = Math.atan2(camera.position.x - object.position.x, camera.position.z - object.position.z) + offset;
  const difference = Math.atan2(Math.sin(target - object.rotation.y), Math.cos(target - object.rotation.y));
  object.rotation.y += difference * (1 - Math.exp(-Math.max(delta, 1 / 120) * 8));
}

function createNoble(index, isSelf) {
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
  if (!isSelf) group.add(body);
  else body.visible = false;

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

const ROLE_VISUALS = {
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
function createRoleFigure(role) {
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

function createInfluenceCard(influence) {
  const geometry = new THREE.BoxGeometry(0.58, 0.035, 0.82);
  const edge = standardMaterial(influence.revealed ? 0x5f574e : COLORS.gold, {
    metalness: 0.45,
    roughness: 0.38,
  });
  const face = new THREE.MeshBasicMaterial({
    color: influence.revealed ? 0x898178 : 0xffffff,
    map: influenceTexture(influence),
  });
  const card = new THREE.Group();
  card.add(mesh(geometry, [edge, edge, face, edge, edge, edge]));
  if (influence.role) {
    card.add(
      mesh(
        new THREE.PlaneGeometry(0.54, 0.162),
        new THREE.MeshBasicMaterial({ map: influenceLabelTexture(influence), transparent: true }),
        {
          position: [0, 0.022, 0.315],
          rotation: [-Math.PI / 2, 0, 0],
          cast: false,
          receive: false,
        },
      ),
    );
  }
  return card;
}

function cameraForBeat(beat) {
  if (beat === 'claim' || beat === 'block-window' || beat === 'block-claim') return 'duel';
  if (beat === 'influence-loss' || beat === 'exchange') return 'evidence';
  if (beat === 'victory') return 'throne';
  return 'table';
}

function povCameraForSeat(seat, seatCount) {
  const radiusX = seatCount <= 3 ? 5.15 : 5.55;
  const radiusZ = seatCount <= 3 ? 4.25 : 4.65;
  const outwardX = Math.sin(seat.azimuthRad);
  const outwardZ = Math.cos(seat.azimuthRad);
  const seatX = outwardX * radiusX;
  const seatZ = outwardZ * radiusZ;
  return {
    position: [seatX + outwardX * 3.05, 2.8, seatZ + outwardZ * 3.05],
    target: [-outwardX * 1.85, 1.35, -outwardZ * 1.85],
    fov: 55,
    portrait: {
      position: [seatX + outwardX * 3.55, 3.15, seatZ + outwardZ * 3.55],
      target: [-outwardX * 1.55, 1.45, -outwardZ * 1.55],
      fov: 59,
    },
  };
}

export class CoupTableScene {
  constructor(canvas, options = {}) {
    this.theme = options.theme === 'light' ? 'light' : 'dark';
    this.quality = resolveTabletopQuality(options.quality);
    const profile = THEME_PROFILES[this.theme];
    this.stage = new TabletopStage(canvas, {
      clearColor: profile.clearColor,
      fogColor: profile.fogColor,
      fogDensity: profile.fogDensity,
      pixelScale: options.pixelScale ?? this.quality.pixelScale,
      maxDevicePixelRatio: options.maxDevicePixelRatio ?? this.quality.maxDevicePixelRatio,
      exposure: profile.exposure,
      grain: profile.grain,
      vignette: profile.vignette,
      reducedMotion: options.reducedMotion,
    });
    this.stage.defineCameraAct('table', {
      position: [0, 5.35, 11.45],
      target: [0, 1.45, -0.8],
      fov: 49,
      portrait: { position: [0, 6.85, 11.25], target: [0, 1.35, -0.35], fov: 70 },
    });
    this.stage.defineCameraAct('pov', {
      position: [0, 2.8, 7.8],
      target: [0, 1.35, -1.9],
      fov: 55,
      portrait: { position: [0, 3.25, 10.8], target: [0, 1.45, -1.05], fov: 57 },
    });
    this.stage.defineCameraAct('duel', {
      position: [7.7, 4.3, 8.6],
      target: [0, 1.45, 0],
      fov: 43,
      portrait: { position: [5.9, 4.8, 10.4], target: [0, 1.65, 0], fov: 60 },
    });
    this.stage.defineCameraAct('evidence', {
      position: [0, 4.7, 6.8],
      target: [0, 1.3, 0.1],
      fov: 40,
      portrait: { position: [0, 5.1, 9.4], target: [0, 1.45, 0], fov: 49 },
    });
    this.stage.defineCameraAct('overhead', {
      position: [0, 8.05, 6.4],
      target: [0, 0.5, 0],
      fov: 52,
      portrait: { position: [0, 8.05, 7.35], target: [0, 0.5, 0], fov: 58 },
    });
    this.stage.defineCameraAct('throne', {
      position: [0, 4.15, 10.2],
      target: [0, 1.75, -2.05],
      fov: 41,
      portrait: { position: [0, 5.4, 11.1], target: [0, 1.8, -1.55], fov: 62 },
    });
    this.stage.defineCameraAct('portal', {
      position: [0, 4.25, 5.8],
      target: [0, 3.3, 12.4],
      fov: 42,
      portrait: { position: [0, 4.9, 1.8], target: [0, 3.45, 12.5], fov: 54 },
    });
    this.stage.setCameraAct('table', { immediate: true });

    this.environment = createCoupEnvironment(this.stage, { theme: this.theme });
    this.seatLayer = this.stage.add(new THREE.Group());
    this.seatLayer.name = 'coup-seats';
    this.seats = new Map();
    this.seatSignature = '';
    this.view = null;
    this.previousBeat = null;
    this.cameraOverridden = false;
    this.cameraName = 'table';
    this.currentPovSeatId = null;
    this.actionTexture = null;
    this.actionCaptionTexture = null;
    this.actionSignature = '';
    this.publicRole = null;
    this.publicRoleName = null;

    this.actionCard = new THREE.Group();
    const edge = standardMaterial(COLORS.gold, { metalness: 0.55, roughness: 0.3 });
    this.actionFace = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.actionCard.add(mesh(new THREE.BoxGeometry(1.42, 1.95, 0.08), [edge, edge, edge, edge, this.actionFace, edge]));
    this.actionCaptionMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.actionCard.add(
      mesh(new THREE.PlaneGeometry(1.34, 0.52), this.actionCaptionMaterial, {
        position: [0, -0.69, 0.047],
        cast: false,
        receive: false,
      }),
    );
    this.actionCard.position.set(0.72, 2.35, -0.15);
    this.actionCard.rotation.y = -0.08;
    this.actionCard.visible = false;
    this.actionTargetX = 0;
    this.actionTargetZ = -0.15;
    this.publicRoleTargetX = 0;
    this.publicRoleTargetZ = -0.15;
    this.stage.add(this.actionCard);

    this.seal = mesh(
      new THREE.TorusGeometry(0.74, 0.07, 8, 28),
      standardMaterial(COLORS.gold, { emissive: COLORS.gold, emissiveIntensity: 0.15 }),
      {
        position: [0, 1.31, 0],
        rotation: [-Math.PI / 2, 0, 0],
      },
    );
    this.stage.add(this.seal);
    this.victoryLight = new THREE.SpotLight(0xffd78f, 0, 15, 0.38, 0.55, 1.4);
    this.victoryLight.position.set(0, 8, 4.2);
    this.victoryLight.target.position.set(0, 1.4, -3.5);
    this.stage.add(this.victoryLight);
    this.stage.add(this.victoryLight.target);

    this.stage.addUpdater(({ delta, elapsed, reducedMotion }) => this.update(elapsed, reducedMotion, delta));
  }

  rebuildSeats(view) {
    disposeObject3D(this.seatLayer);
    this.seatLayer = this.stage.add(new THREE.Group());
    this.seatLayer.name = 'coup-seats';
    this.seats.clear();
    const count = view.seats.length;
    for (const seatView of view.seats) {
      const angle = seatView.azimuthRad;
      const radiusX = count <= 3 ? 5.15 : 5.55;
      const radiusZ = count <= 3 ? 4.25 : 4.65;
      const noble = createNoble(seatView.index, seatView.isSelf);
      noble.group.position.set(Math.sin(angle) * radiusX, 0, Math.cos(angle) * radiusZ);
      noble.group.rotation.y = angle + Math.PI;

      const plaque = mesh(
        new THREE.PlaneGeometry(1.65, 0.41),
        new THREE.MeshBasicMaterial({
          map: plaqueTexture(seatView.name, seatView.isSelf ? 'VOCÊ' : 'CONSELHEIRO'),
          transparent: false,
        }),
        {
          position: [0, 1.34, -1.65],
          rotation: [-Math.PI / 2, 0, 0],
          cast: false,
        },
      );
      noble.group.add(plaque);

      const coinGroup = new THREE.Group();
      coinGroup.position.set(-1, 1.27, -1.18);
      noble.group.add(coinGroup);
      const influenceGroup = new THREE.Group();
      influenceGroup.position.set(0.34, 1.28, -1.23);
      noble.group.add(influenceGroup);
      this.seatLayer.add(noble.group);
      this.seats.set(seatView.id, {
        ...noble,
        plaque,
        coinGroup,
        influenceGroup,
        influenceSignature: '',
        coinCount: -1,
        baseY: noble.group.position.y,
        seed: seatView.index * 1.71,
      });
    }
  }

  povSelection() {
    const seats = this.view?.seats ?? [];
    const seat =
      seats.find((candidate) => candidate.id === this.currentPovSeatId) ?? seats.find((candidate) => candidate.isSelf);
    return seat ? { id: seat.id, name: seat.name } : null;
  }

  setPovSeat(seatId, { immediate = false } = {}) {
    const seats = this.view?.seats ?? [];
    const seat =
      seats.find((candidate) => candidate.id === seatId) ?? seats.find((candidate) => candidate.isSelf) ?? seats[0];
    if (!seat) return null;
    this.currentPovSeatId = seat.id;
    this.stage.defineCameraAct('pov', povCameraForSeat(seat, seats.length));
    this.cameraOverridden = true;
    this.cameraName = 'pov';
    this.stage.setCameraAct('pov', { immediate });
    return this.povSelection();
  }

  cyclePovSeat() {
    const seats = this.view?.seats ?? [];
    if (!seats.length) return null;
    const currentIndex = seats.findIndex((seat) => seat.id === this.currentPovSeatId);
    return this.setPovSeat(seats[(currentIndex + 1 + seats.length) % seats.length].id);
  }

  updateSeat(seatView) {
    const seat = this.seats.get(seatView.id);
    if (!seat) return;
    seat.group.visible = seatView.connected || !seatView.eliminated;
    seat.group.scale.setScalar(seatView.eliminated ? 0.94 : 1);
    seat.group.rotation.z = seatView.eliminated ? 0.09 : 0;
    seat.body.rotation.x = seatView.eliminated ? -0.2 : 0;
    const focusOpacity = seatView.isWinner
      ? 0.72
      : seatView.isActor || seatView.isCurrent
        ? 0.48
        : seatView.isTarget || seatView.isBlocker
          ? 0.34
          : 0;
    seat.focus.visible = focusOpacity > 0;
    seat.focus.material.opacity = focusOpacity;
    seat.focus.material.color.setHex(seatView.isTarget ? COLORS.danger : COLORS.gold);

    if (seat.coinCount !== seatView.coins) {
      disposeObject3D(seat.coinGroup);
      seat.coinGroup = new THREE.Group();
      seat.coinGroup.position.set(-1, 1.27, -1.18);
      seat.group.add(seat.coinGroup);
      const visibleCoins = Math.min(seatView.coins, 7);
      for (let index = 0; index < visibleCoins; index += 1) {
        const coin = mesh(
          new THREE.CylinderGeometry(0.14, 0.14, 0.035, 12),
          standardMaterial(COLORS.gold, { metalness: 0.8, roughness: 0.25 }),
          {
            position: [(index % 3) * 0.19, Math.floor(index / 3) * 0.045, (index % 2) * 0.08],
            rotation: [0, index * 0.31, 0],
          },
        );
        seat.coinGroup.add(coin);
      }
      seat.coinCount = seatView.coins;
    }

    const influenceSignature = seatView.influences.map((card) => `${card.role}:${card.revealed}`).join('|');
    if (influenceSignature !== seat.influenceSignature) {
      disposeObject3D(seat.influenceGroup);
      seat.influenceGroup = new THREE.Group();
      seat.influenceGroup.position.set(0.34, 1.28, -1.23);
      seat.group.add(seat.influenceGroup);
      seatView.influences.forEach((influence, index) => {
        const card = createInfluenceCard(influence);
        card.position.set(index * 0.66, influence.revealed ? 0.055 : 0, index * 0.08);
        card.rotation.y = index ? -0.12 : 0.1;
        card.rotation.z = influence.revealed ? 0.04 : 0;
        seat.influenceGroup.add(card);
      });
      seat.influenceSignature = influenceSignature;
    }
  }

  updateActionCard(view) {
    const action = view.action;
    const block = view.block;
    const visible = Boolean(action && ['claim', 'block-window', 'block-claim', 'influence-loss'].includes(view.beat));
    this.actionCard.visible = visible;
    if (!visible) {
      this.setPublicRole(null);
      this.layoutCenterpiece();
      return;
    }
    const title = block?.role ?? action.claimedRole ?? action.label;
    this.setPublicRole(ROLE_VISUALS[title] ? title : null);
    this.layoutCenterpiece();
    const kicker = block ? 'BLOQUEIO DECLARADO' : action.claimedRole ? 'INFLUÊNCIA ALEGADA' : 'AÇÃO DA CORTE';
    const footer = block
      ? `${block.player.name} INTERVÉM`
      : action.target
        ? `${action.actor.name} → ${action.target.name}`
        : action.actor.name;
    const signature = `${action.id}|${title}|${kicker}|${footer}`;
    if (signature === this.actionSignature) return;
    this.actionTexture?.dispose();
    this.actionCaptionTexture?.dispose();
    const accent = ROLE_CARD_ACCENTS[title] ?? (block ? '#e16466' : '#e0bc74');
    this.actionTexture = imageTexture(ACTION_ART[action.id]);
    this.actionCaptionTexture = actionCaptionTexture(title, kicker, footer, accent);
    this.actionFace.map = this.actionTexture;
    this.actionFace.needsUpdate = true;
    this.actionCaptionMaterial.map = this.actionCaptionTexture;
    this.actionCaptionMaterial.needsUpdate = true;
    this.actionSignature = signature;
  }

  setPublicRole(role) {
    if (role === this.publicRoleName) return;
    if (this.publicRole) disposeObject3D(this.publicRole);
    this.publicRole = role ? createRoleFigure(role) : null;
    this.publicRoleName = role;
    if (!this.publicRole) return;
    this.publicRole.position.set(-0.92, 1.26, -0.18);
    this.publicRole.rotation.y = 0.16;
    this.publicRole.scale.setScalar(0.84);
    this.stage.add(this.publicRole);
  }

  layoutCenterpiece() {
    const split = this.actionCard.visible && Boolean(this.publicRole);
    const cameraX = this.stage.camera.position.x;
    const cameraZ = this.stage.camera.position.z;
    const cameraRadius = Math.max(0.001, Math.hypot(cameraX, cameraZ));
    const screenRightX = cameraZ / cameraRadius;
    const screenRightZ = -cameraX / cameraRadius;
    const actionOffset = split ? 0.72 : 0;
    const roleOffset = split ? -0.92 : 0;
    this.actionTargetX = screenRightX * actionOffset;
    this.actionTargetZ = -0.15 + screenRightZ * actionOffset;
    this.publicRoleTargetX = screenRightX * roleOffset;
    this.publicRoleTargetZ = -0.15 + screenRightZ * roleOffset;
  }

  sync(view) {
    const signature = view.seats.map((seat) => seat.id).join('|');
    const seatsChanged = signature !== this.seatSignature;
    if (seatsChanged) {
      this.rebuildSeats(view);
      this.seatSignature = signature;
    }
    for (const seat of view.seats) this.updateSeat(seat);
    this.updateActionCard(view);
    this.view = view;
    if (!this.currentPovSeatId || !view.seats.some((seat) => seat.id === this.currentPovSeatId)) {
      this.currentPovSeatId = view.seats.find((seat) => seat.isSelf)?.id ?? view.seats[0]?.id ?? null;
    }
    if (seatsChanged && this.cameraOverridden && this.cameraName === 'pov') {
      this.setPovSeat(this.currentPovSeatId, { immediate: true });
    }
    this.victoryLight.intensity = view.beat === 'victory' ? 95 : 0;
    this.environment.setMood(view.beat);
    this.seal.material.color.setHex(
      ['claim', 'block-claim', 'influence-loss'].includes(view.beat) ? COLORS.danger : COLORS.gold,
    );
    this.seal.material.emissive.setHex(
      ['claim', 'block-claim', 'influence-loss'].includes(view.beat) ? COLORS.danger : COLORS.gold,
    );
    if (view.beat !== this.previousBeat && !this.cameraOverridden) {
      this.cameraName = cameraForBeat(view.beat);
      this.stage.setCameraAct(this.cameraName);
    }
    this.previousBeat = view.beat;
  }

  setCamera(name) {
    if (name === 'pov') return this.setPovSeat(this.currentPovSeatId);
    this.cameraOverridden = name !== 'auto';
    this.cameraName = name === 'auto' ? cameraForBeat(this.view?.beat) : name;
    this.stage.setCameraAct(this.cameraName);
    return this.povSelection();
  }

  runPerformanceBenchmark({ warmupMs, durationMs, label = 'coup-standard' } = {}) {
    return this.stage.runPerformanceBenchmark({
      label,
      warmupMs,
      durationMs,
      metadata: {
        game: 'coup',
        theme: this.theme,
        quality: this.quality.id,
        beat: this.view?.beat ?? null,
        camera: this.cameraName,
        povSeat: this.cameraName === 'pov' ? this.currentPovSeatId : null,
      },
    });
  }

  performanceBenchmarkState() {
    return this.stage.performanceBenchmarkState();
  }

  setQuality(quality) {
    this.quality = resolveTabletopQuality(quality);
    this.stage.setResolutionProfile(this.quality);
  }

  setTheme(theme) {
    const nextTheme = theme === 'light' ? 'light' : 'dark';
    if (nextTheme === this.theme) return;
    this.theme = nextTheme;
    disposeObject3D(this.environment.room);
    this.environment = createCoupEnvironment(this.stage, { theme: nextTheme });
    this.environment.setMood(this.view?.beat ?? 'turn');
    this.stage.setVisualProfile(THEME_PROFILES[nextTheme]);
    this.victoryLight.color.setHex(nextTheme === 'light' ? 0xffe6ae : 0xffd78f);
  }

  update(elapsed, reducedMotion, delta) {
    this.environment.update(elapsed, reducedMotion);
    this.seal.rotation.z = elapsed * 0.14;
    this.layoutCenterpiece();
    const centerEase = reducedMotion ? 1 : 1 - Math.exp(-Math.max(delta, 1 / 120) * 7);
    if (this.actionCard.visible) {
      this.actionCard.position.x += (this.actionTargetX - this.actionCard.position.x) * centerEase;
      this.actionCard.position.z += (this.actionTargetZ - this.actionCard.position.z) * centerEase;
      this.actionCard.position.y = 2.35 + (reducedMotion ? 0 : Math.sin(elapsed * 1.7) * 0.055);
      faceCameraYaw(this.actionCard, this.stage.camera, reducedMotion ? 1 : delta);
    }
    if (this.publicRole) {
      this.publicRole.position.x += (this.publicRoleTargetX - this.publicRole.position.x) * centerEase;
      this.publicRole.position.z += (this.publicRoleTargetZ - this.publicRole.position.z) * centerEase;
      this.publicRole.position.y = 1.26 + (reducedMotion ? 0 : Math.sin(elapsed * 1.45 + 0.8) * 0.035);
      faceCameraYaw(this.publicRole, this.stage.camera, reducedMotion ? 1 : delta, 0.14);
    }
    for (const [id, seat] of this.seats) {
      const state = this.view?.seats.find((candidate) => candidate.id === id);
      if (!state || state.isSelf) continue;
      const emphasis = state.isActor || state.isCurrent || state.isWinner;
      seat.body.position.y = reducedMotion
        ? 0
        : Math.sin(elapsed * (emphasis ? 2.1 : 1.1) + seat.seed) * (emphasis ? 0.045 : 0.018);
      seat.body.rotation.z = reducedMotion ? 0 : Math.sin(elapsed * 0.75 + seat.seed) * 0.012;
    }
  }

  dispose() {
    this.actionTexture?.dispose();
    this.actionCaptionTexture?.dispose();
    this.stage.dispose();
  }
}
