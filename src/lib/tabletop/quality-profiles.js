export const TABLETOP_QUALITY_KEY = 'la-corte-3d-quality';

export const TABLETOP_QUALITY_PROFILES = Object.freeze({
  cinematic: Object.freeze({
    id: 'cinematic',
    label: 'Cinemático',
    pixelScale: 1.25,
    maxDevicePixelRatio: 2,
  }),
  balanced: Object.freeze({
    id: 'balanced',
    label: 'Equilibrado',
    pixelScale: 2.5,
    maxDevicePixelRatio: 1.25,
  }),
  performance: Object.freeze({
    id: 'performance',
    label: 'Performance',
    pixelScale: 4,
    maxDevicePixelRatio: 1,
  }),
});

export const TABLETOP_QUALITY_ORDER = Object.freeze(['cinematic', 'balanced', 'performance']);

export function resolveTabletopQuality(value) {
  return TABLETOP_QUALITY_PROFILES[value] ?? TABLETOP_QUALITY_PROFILES.cinematic;
}

export function nextTabletopQuality(value) {
  const index = TABLETOP_QUALITY_ORDER.indexOf(resolveTabletopQuality(value).id);
  return resolveTabletopQuality(TABLETOP_QUALITY_ORDER[(index + 1) % TABLETOP_QUALITY_ORDER.length]);
}

export function initialTabletopQuality({ search = '', storage } = {}) {
  const requested = new URLSearchParams(search).get('quality');
  if (requested && TABLETOP_QUALITY_PROFILES[requested]) return TABLETOP_QUALITY_PROFILES[requested];
  return resolveTabletopQuality(storage?.getItem(TABLETOP_QUALITY_KEY));
}
