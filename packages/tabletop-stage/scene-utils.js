import * as THREE from 'three';

function disposeMaterial(material) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value?.isTexture) value.dispose();
  }
  material.dispose?.();
}

export function disposeObject3D(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach(disposeMaterial);
    else disposeMaterial(child.material);
  });
  object.removeFromParent();
}

export function canvasTexture(draw, { width = 512, height = 256 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  draw(context, canvas);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

export function textTexture({
  title,
  kicker = '',
  footer = '',
  background = '#17120e',
  foreground = '#eee6d6',
  accent = '#d9b56b',
  width = 512,
  height = 256,
}) {
  return canvasTexture(
    (context) => {
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);
      context.strokeStyle = accent;
      context.lineWidth = 10;
      context.strokeRect(12, 12, width - 24, height - 24);
      context.textBaseline = 'top';
      context.fillStyle = accent;
      context.font = "700 24px 'DM Sans', sans-serif";
      context.fillText(kicker.toUpperCase(), 36, 30);
      context.fillStyle = foreground;
      context.font = "600 46px 'Cormorant Garamond', serif";
      const words = String(title).split(/\s+/);
      const lines = [];
      let line = '';
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (context.measureText(candidate).width > width - 72 && line) {
          lines.push(line);
          line = word;
        } else line = candidate;
      }
      if (line) lines.push(line);
      lines.slice(0, 3).forEach((value, index) => context.fillText(value, 36, 76 + index * 48));
      context.fillStyle = 'rgba(238,230,214,.62)';
      context.font = "600 18px 'DM Sans', sans-serif";
      context.fillText(footer.toUpperCase(), 36, height - 48);
    },
    { width, height },
  );
}
