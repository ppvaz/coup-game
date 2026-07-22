import * as THREE from 'three';
import { canvasTexture } from '@la-corte/tabletop-stage';
import courtCityDay from '../../../../assets/environment/court-city-day-panorama.webp';
import courtCityNight from '../../../../assets/environment/court-city-night-panorama.webp';

const OUTSIDE_PANORAMAS = {
  dark: courtCityNight,
  light: courtCityDay,
};

export function mulberry32(seed) {
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

export function createPlasterTexture(theme) {
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

export function createFloorTexture(theme) {
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

export function createMarbleTexture(theme) {
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

export function createCarpetTexture(theme) {
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

export function createOutsideViewTexture(variant, theme) {
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

export function createCurtainTexture(theme = 'dark') {
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

export function createMedallionTexture({ glyph, name }, theme = 'dark') {
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

export function createCourtSealTexture(theme = 'dark') {
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
