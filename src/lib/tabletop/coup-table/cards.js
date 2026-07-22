import * as THREE from 'three';
import { canvasTexture, textTexture } from '@la-corte/tabletop-stage';
import { COLORS, mesh, standardMaterial } from './primitives.js';
import { ROLE_COLORS, ROLE_PORTRAITS } from './visual-theme.js';

export function plaqueTexture(name, subtitle, accent = '#d9b56b') {
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

// Influência revelada é influência morta: o retrato vai para a mesa sem cor,
// distinguindo à distância o que ainda joga do que já caiu.
const DEAD_PORTRAIT_TEXTURES = new Map();
function deadPortraitTexture(role) {
  if (DEAD_PORTRAIT_TEXTURES.has(role)) return DEAD_PORTRAIT_TEXTURES.get(role);
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 480;
  const context = canvas.getContext('2d');
  context.fillStyle = '#141110';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    context.filter = 'grayscale(1) brightness(0.72) contrast(0.92)';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    texture.needsUpdate = true;
  };
  image.src = ROLE_PORTRAITS[role];
  DEAD_PORTRAIT_TEXTURES.set(role, texture);
  return texture;
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
  if (influence.revealed) return deadPortraitTexture(influence.role);
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

export function imageTexture(source) {
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

export function actionCaptionTexture(title, kicker, footer, accent) {
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

function createInfluenceFrame(material, height = 0.032) {
  const frame = new THREE.Group();
  for (const [width, depth, x, z] of [
    [0.7, 0.035, 0, -0.46],
    [0.7, 0.035, 0, 0.46],
    [0.035, 0.94, -0.34, 0],
    [0.035, 0.94, 0.34, 0],
  ]) {
    frame.add(
      mesh(new THREE.BoxGeometry(width, 0.012, depth), material, {
        position: [x, height, z],
        cast: false,
        receive: false,
      }),
    );
  }
  return frame;
}

export function createInfluenceCard(influence) {
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
  if (influence.selectable) {
    const selectionMaterial = new THREE.MeshBasicMaterial({
      color: influence.selected ? 0x9ed5a7 : 0xffdda0,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      toneMapped: false,
    });
    const selectionFrame = createInfluenceFrame(selectionMaterial);
    card.add(selectionFrame);
    card.userData.selectionFrame = selectionFrame;
    card.userData.selectionMaterial = selectionMaterial;
  }
  if (influence.focusable) {
    const focusMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false,
    });
    const focusFrame = createInfluenceFrame(focusMaterial, 0.047);
    focusFrame.visible = false;
    card.add(focusFrame);
    card.userData.focusFrame = focusFrame;
  }
  card.userData.influenceId = influence.id;
  card.userData.selectable = influence.selectable;
  card.userData.focusable = influence.focusable;
  card.userData.selected = influence.selected;
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
