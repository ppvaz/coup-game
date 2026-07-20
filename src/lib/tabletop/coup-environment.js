import * as THREE from 'three';
import { canvasTexture } from '@la-corte/tabletop-stage';
import courtCityDay from '../../../assets/environment/court-city-day-panorama.webp';
import courtCityNight from '../../../assets/environment/court-city-night-panorama.webp';

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

const OUTSIDE_PANORAMAS = {
  dark: courtCityNight,
  light: courtCityDay,
};

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

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function maskWindowTexture(context, canvas) {
  const width = canvas.width;
  const height = canvas.height;
  context.globalCompositeOperation = 'destination-in';
  context.fillStyle = '#fff';
  const inset = 8;
  const spring = inset + (width - inset * 2) / 2;
  context.beginPath();
  context.moveTo(inset, height - inset);
  context.lineTo(inset, spring);
  context.quadraticCurveTo(inset, inset, width / 2, inset);
  context.quadraticCurveTo(width - inset, inset, width - inset, spring);
  context.lineTo(width - inset, height - inset);
  context.closePath();
  context.fill();
  context.globalCompositeOperation = 'source-over';
}

function createPlasterTexture(theme) {
  const daylight = theme === 'light';
  const random = mulberry32(1407);
  const texture = canvasTexture(
    (context, canvas) => {
      context.fillStyle = daylight ? '#d9c6a4' : '#51463a';
      context.fillRect(0, 0, canvas.width, canvas.height);
      for (let index = 0; index < 2400; index += 1) {
        const alpha = random() * (daylight ? 0.065 : 0.08);
        context.fillStyle =
          random() > 0.5 ? `rgba(255,242,215,${alpha})` : `rgba(${daylight ? '73,52,35' : '28,18,13'},${alpha})`;
        const size = 1 + random() * 5;
        context.fillRect(random() * canvas.width, random() * canvas.height, size, size);
      }
      context.strokeStyle = 'rgba(20,12,8,.1)';
      context.lineWidth = 2;
      for (let y = 40; y < canvas.height; y += 64) {
        context.beginPath();
        context.moveTo(0, y + random() * 7);
        context.bezierCurveTo(canvas.width * 0.3, y - 4, canvas.width * 0.7, y + 5, canvas.width, y - 2);
        context.stroke();
      }
    },
    { width: 512, height: 512 },
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 2);
  return texture;
}

function createFloorTexture(theme) {
  const daylight = theme === 'light';
  const texture = canvasTexture(
    (context, canvas) => {
      context.fillStyle = daylight ? '#c8b89e' : '#302c28';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const size = 64;
      for (let y = 0; y < canvas.height; y += size) {
        for (let x = 0; x < canvas.width; x += size) {
          const alternate = (x / size + y / size) % 2 === 0;
          context.fillStyle = alternate ? (daylight ? '#e1d2b8' : '#403a34') : daylight ? '#b5a48c' : '#292622';
          context.fillRect(x, y, size, size);
          context.strokeStyle = `rgba(217,181,107,${daylight ? 0.16 : 0.24})`;
          context.strokeRect(x + 1, y + 1, size - 2, size - 2);
          context.strokeStyle = `rgba(255,255,255,${daylight ? 0.08 : 0.055})`;
          context.beginPath();
          context.moveTo(x + 6, y + size - 7);
          context.lineTo(x + size - 8, y + 5);
          context.stroke();
        }
      }
    },
    { width: 512, height: 512 },
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4.5, 4.5);
  return texture;
}

function createMarbleTexture(theme) {
  const daylight = theme === 'light';
  const random = mulberry32(daylight ? 551 : 557);
  const texture = canvasTexture(
    (context, canvas) => {
      context.fillStyle = daylight ? '#e6d8be' : '#35322f';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const glow = context.createRadialGradient(220, 170, 20, 220, 170, 360);
      glow.addColorStop(0, daylight ? 'rgba(255,249,231,.56)' : 'rgba(116,105,91,.3)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = glow;
      context.fillRect(0, 0, canvas.width, canvas.height);

      for (let index = 0; index < 22; index += 1) {
        const y = random() * canvas.height;
        context.beginPath();
        context.moveTo(-20, y);
        context.bezierCurveTo(
          canvas.width * 0.26,
          y - 65 + random() * 130,
          canvas.width * 0.68,
          y - 85 + random() * 170,
          canvas.width + 20,
          y - 30 + random() * 60,
        );
        context.strokeStyle = daylight
          ? `rgba(125,91,54,${0.08 + random() * 0.13})`
          : `rgba(213,171,98,${0.13 + random() * 0.21})`;
        context.lineWidth = 0.8 + random() * 2.8;
        context.stroke();
        if (index % 4 === 0) {
          context.strokeStyle = daylight ? 'rgba(255,255,250,.34)' : 'rgba(230,222,205,.1)';
          context.lineWidth = 0.65;
          context.stroke();
        }
      }
    },
    { width: 512, height: 512 },
  );
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.7, 1.25);
  return texture;
}

function createCarpetTexture(theme) {
  const daylight = theme === 'light';
  return canvasTexture(
    (context, canvas) => {
      const field = context.createRadialGradient(256, 240, 24, 256, 256, 350);
      field.addColorStop(0, daylight ? '#7a3036' : '#42171b');
      field.addColorStop(0.72, daylight ? '#64242a' : '#2d1013');
      field.addColorStop(1, daylight ? '#42181d' : '#1b090b');
      context.fillStyle = field;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = daylight ? '#c69a50' : '#a98243';
      context.lineWidth = 18;
      context.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);
      context.strokeStyle = 'rgba(217,181,107,.58)';
      context.lineWidth = 4;
      context.strokeRect(48, 48, canvas.width - 96, canvas.height - 96);
      context.translate(canvas.width / 2, canvas.height / 2);
      context.strokeStyle = 'rgba(217,181,107,.3)';
      context.lineWidth = 5;
      for (const radius of [76, 142]) {
        context.beginPath();
        context.arc(0, 0, radius, 0, Math.PI * 2);
        context.stroke();
      }
      context.rotate(Math.PI / 4);
      context.strokeRect(-96, -96, 192, 192);
      for (let index = 0; index < 18; index += 1) {
        const angle = (Math.PI * 2 * index) / 18;
        context.fillStyle = `rgba(238,207,143,${0.025 + (index % 3) * 0.012})`;
        context.beginPath();
        context.arc(Math.cos(angle) * 184, Math.sin(angle) * 184, 11, 0, Math.PI * 2);
        context.fill();
      }
    },
    { width: 512, height: 512 },
  );
}

function createSkylineTexture(variant = 0, theme = 'dark') {
  const daylight = theme === 'light';
  const random = mulberry32(920 + variant * 83);
  return canvasTexture(
    (context, canvas) => {
      const width = canvas.width;
      const height = canvas.height;
      const sky = context.createLinearGradient(0, 0, 0, canvas.height);
      sky.addColorStop(0, daylight ? '#668ba7' : '#11152a');
      sky.addColorStop(0.48, daylight ? '#a9c1c7' : '#34304b');
      sky.addColorStop(0.76, daylight ? '#e1cba5' : '#98584d');
      sky.addColorStop(1, daylight ? '#d8a966' : '#d38b59');
      context.fillStyle = sky;
      context.fillRect(0, 0, width, height);

      for (let index = 0; index < (daylight ? 4 : 52); index += 1) {
        const x = random() * width;
        const y = random() * height * 0.55;
        const radius = random() > 0.88 ? 1.6 : 0.7;
        context.fillStyle = `rgba(255,236,188,${0.25 + random() * 0.65})`;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }

      const sunX = variant === 1 ? width * 0.72 : width * 0.24;
      const sunGlow = context.createRadialGradient(sunX, 118, 8, sunX, 118, 74);
      sunGlow.addColorStop(0, daylight ? 'rgba(255,246,205,.96)' : 'rgba(255,229,175,.82)');
      sunGlow.addColorStop(1, 'rgba(255,214,142,0)');
      context.fillStyle = sunGlow;
      context.fillRect(sunX - 78, 40, 156, 156);
      context.fillStyle = daylight ? '#fff0c0' : '#f4d89f';
      context.beginPath();
      context.arc(sunX, 118, daylight ? 18 : 13, 0, Math.PI * 2);
      context.fill();

      if (daylight) {
        context.fillStyle = 'rgba(244,235,211,.18)';
        for (let index = 0; index < 4; index += 1) {
          const cloudX = -35 + index * 125 + variant * 22;
          const cloudY = 190 + (index % 2) * 68;
          context.beginPath();
          context.ellipse(cloudX, cloudY, 76, 16, -0.08, 0, Math.PI * 2);
          context.fill();
        }
      }

      context.fillStyle = daylight ? '#8a806f' : '#2b2830';
      context.beginPath();
      context.moveTo(0, 455);
      context.bezierCurveTo(70, 397, 125, 442, 192, 402);
      context.bezierCurveTo(258, 362, 314, 430, width, 386);
      context.lineTo(width, height);
      context.lineTo(0, height);
      context.closePath();
      context.fill();

      const drawCityLayer = (base, minHeight, maxHeight, fill, windowAlpha) => {
        let x = -18;
        context.fillStyle = fill;
        while (x < width + 20) {
          const buildingWidth = 24 + random() * 38;
          const buildingHeight = minHeight + random() * (maxHeight - minHeight);
          const top = base - buildingHeight;
          context.fillRect(x, top, buildingWidth, buildingHeight + height - base);
          if (random() > 0.42) {
            context.beginPath();
            context.moveTo(x - 3, top);
            context.lineTo(x + buildingWidth / 2, top - 16 - random() * 25);
            context.lineTo(x + buildingWidth + 3, top);
            context.closePath();
            context.fill();
          }
          context.fillStyle = daylight ? `rgba(80,62,46,${windowAlpha})` : `rgba(255,190,104,${windowAlpha})`;
          for (let wx = x + 8; wx < x + buildingWidth - 5; wx += 13) {
            for (let wy = top + 14; wy < base - 10; wy += 19) {
              if (random() > 0.48) context.fillRect(wx, wy, 3, 6);
            }
          }
          context.fillStyle = fill;
          x += buildingWidth - 2;
        }
      };

      drawCityLayer(580, 52, 118, daylight ? '#776959' : '#201c23', daylight ? 0.22 : 0.5);

      const landmarkX = variant === 1 ? 112 : 265;
      const landmarkBase = 590;
      const landmark = daylight ? '#51463d' : '#121116';
      context.fillStyle = landmark;
      context.fillRect(landmarkX - 48, landmarkBase - 118, 96, 132);
      context.beginPath();
      context.moveTo(landmarkX - 58, landmarkBase - 116);
      context.bezierCurveTo(
        landmarkX - 48,
        landmarkBase - 188,
        landmarkX + 48,
        landmarkBase - 188,
        landmarkX + 58,
        landmarkBase - 116,
      );
      context.closePath();
      context.fill();
      context.fillRect(landmarkX - 5, landmarkBase - 196, 10, 34);
      context.beginPath();
      context.moveTo(landmarkX - 12, landmarkBase - 195);
      context.lineTo(landmarkX, landmarkBase - 218);
      context.lineTo(landmarkX + 12, landmarkBase - 195);
      context.closePath();
      context.fill();

      const towerX = variant === 1 ? 286 : 88;
      context.fillRect(towerX - 18, 405, 36, 188);
      context.beginPath();
      context.moveTo(towerX - 25, 405);
      context.lineTo(towerX, 354);
      context.lineTo(towerX + 25, 405);
      context.closePath();
      context.fill();
      context.fillRect(towerX - 3, 338, 6, 22);

      drawCityLayer(625, 72, 142, daylight ? '#493c33' : '#0c0b0f', daylight ? 0.16 : 0.62);

      const haze = context.createLinearGradient(0, 360, 0, height);
      haze.addColorStop(0, 'rgba(255,225,181,0)');
      haze.addColorStop(0.48, daylight ? 'rgba(235,208,166,.1)' : 'rgba(206,112,76,.05)');
      haze.addColorStop(1, 'rgba(9,7,8,.2)');
      context.fillStyle = haze;
      context.fillRect(0, 360, width, height - 360);

      maskWindowTexture(context, canvas);
    },
    { width: 384, height: 640 },
  );
}

function createOutsideViewTexture(variant, theme) {
  const texture = createSkylineTexture(variant, theme);
  const canvas = texture.image;
  const context = canvas.getContext('2d');
  const image = new Image();
  image.addEventListener('load', () => {
    const targetAspect = canvas.width / canvas.height;
    const cropWidth = Math.min(image.width, image.height * targetAspect);
    const sourceX = variant === 0 ? 0 : image.width - cropWidth;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, sourceX, 0, cropWidth, image.height, 0, 0, canvas.width, canvas.height);
    maskWindowTexture(context, canvas);
    texture.needsUpdate = true;
  });
  image.src = OUTSIDE_PANORAMAS[theme];
  return texture;
}

function createCurtainTexture(theme = 'dark') {
  const daylight = theme === 'light';
  return canvasTexture(
    (context, canvas) => {
      const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
      gradient.addColorStop(0, daylight ? '#4a151a' : '#21090c');
      gradient.addColorStop(0.18, daylight ? '#8a3339' : '#5b1f25');
      gradient.addColorStop(0.38, daylight ? '#4b171c' : '#260c0f');
      gradient.addColorStop(0.58, daylight ? '#91383e' : '#642329');
      gradient.addColorStop(0.78, daylight ? '#52191f' : '#2b0d11');
      gradient.addColorStop(1, daylight ? '#7d2c33' : '#4d181e');
      context.fillStyle = gradient;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'rgba(255,225,174,.08)';
      for (let x = 18; x < canvas.width; x += 42) {
        context.fillRect(x, 0, 5, canvas.height);
      }
      context.fillStyle = '#c6a35d';
      context.fillRect(8, 0, 6, canvas.height);
      context.fillRect(canvas.width - 14, 0, 6, canvas.height);
    },
    { width: 256, height: 768 },
  );
}

function createMedallionTexture({ glyph, name }, theme = 'dark') {
  const daylight = theme === 'light';
  return canvasTexture(
    (context, canvas) => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = daylight ? '#eadcc1' : '#17100c';
      context.beginPath();
      context.arc(128, 128, 113, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#d9b56b';
      context.lineWidth = 11;
      context.stroke();
      context.strokeStyle = 'rgba(217,181,107,.38)';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(128, 128, 91, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = '#d9b56b';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = '600 88px Georgia, serif';
      context.fillText(glyph, 128, 111);
      context.fillStyle = daylight ? '#3b2a20' : '#eee6d6';
      context.font = "700 17px 'DM Sans', sans-serif";
      context.fillText(name, 128, 188);
    },
    { width: 256, height: 256 },
  );
}

function createCourtSealTexture(theme = 'dark') {
  const daylight = theme === 'light';
  return canvasTexture(
    (context, canvas) => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.strokeStyle = daylight ? '#5d4329' : '#d9b56b';
      context.fillStyle = daylight ? '#5d4329' : '#d9b56b';
      context.lineWidth = 9;
      context.beginPath();
      context.arc(256, 250, 186, 0, Math.PI * 2);
      context.stroke();
      context.lineWidth = 3;
      context.beginPath();
      context.arc(256, 250, 164, 0, Math.PI * 2);
      context.stroke();
      context.font = '600 142px Georgia, serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('♛', 256, 218);
      context.font = "600 45px 'Cormorant Garamond', serif";
      context.fillText('LA CORTE', 256, 330);
      context.font = "700 14px 'DM Sans', sans-serif";
      context.fillText('POTERE  ·  INFLUENZA', 256, 367);
      for (const side of [-1, 1]) {
        context.beginPath();
        context.moveTo(256 + side * 80, 292);
        context.quadraticCurveTo(256 + side * 125, 265, 256 + side * 142, 220);
        context.stroke();
      }
    },
    { width: 512, height: 512 },
  );
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
