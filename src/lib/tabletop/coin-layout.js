export const COINS_PER_STACK = 2;

const DEFAULT_COLUMNS = 5;
const DEFAULT_PILE_SPACING = 0.22;
const DEFAULT_LEVEL_HEIGHT = 0.042;
const COURT_TREASURE_SPOTS = Object.freeze([
  Object.freeze({ x: 0, z: 0.03 }),
  Object.freeze({ x: 0.27, z: -0.015 }),
  Object.freeze({ x: 0.54, z: 0.045 }),
  Object.freeze({ x: 0.12, z: 0.295 }),
  Object.freeze({ x: 0.41, z: 0.31 }),
]);
const SECOND_LAYER_ORDER = Object.freeze([1, 3, 0, 4, 2]);

function normalizedCoinCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

/**
 * Organiza uma quantia exata em pilhas baixas e determinísticas. A função não
 * conhece Three.js para que a mesma leitura do tesouro possa ser testada sem o
 * renderer e reaproveitada por outras apresentações da mesa.
 */
export function coinStackLayout(
  value,
  { columns = DEFAULT_COLUMNS, pileSpacing = DEFAULT_PILE_SPACING, levelHeight = DEFAULT_LEVEL_HEIGHT } = {},
) {
  const count = normalizedCoinCount(value);
  const safeColumns = Math.min(COURT_TREASURE_SPOTS.length, Math.max(1, Math.floor(columns)));

  return Array.from({ length: count }, (_, index) => {
    const clusterSize = safeColumns * COINS_PER_STACK;
    const cluster = Math.floor(index / clusterSize);
    const indexInCluster = index % clusterSize;
    const level = Math.floor(indexInCluster / safeColumns);
    const layerIndex = indexInCluster % safeColumns;
    const secondLayerOrder = SECOND_LAYER_ORDER.filter((spotIndex) => spotIndex < safeColumns);
    const spotIndex = level === 0 ? layerIndex : secondLayerOrder[layerIndex];
    const stack = cluster * safeColumns + spotIndex;
    const spot = COURT_TREASURE_SPOTS[spotIndex];
    const stackJitterX = Math.sin((stack + 1) * 2.31) * 0.012;
    const stackJitterZ = Math.cos((stack + 1) * 1.73) * 0.012;
    const levelDriftX = Math.sin((index + 1) * 2.17) * 0.007;
    const levelDriftZ = Math.cos((index + 1) * 1.91) * 0.007;

    return Object.freeze({
      index,
      stack,
      level,
      x: spot.x + stackJitterX + levelDriftX,
      y: level * levelHeight,
      z: spot.z + cluster * (pileSpacing * 1.9) + stackJitterZ + levelDriftZ,
      rotationY: ((index * 0.47 + stack * 0.19) % 1) * Math.PI * 2,
    });
  });
}

export function coinStackBounds(layout, radius = 0.14) {
  if (!layout.length) {
    return Object.freeze({ centerX: 0, centerY: 0.04, centerZ: 0, width: radius * 2, height: 0.12, depth: radius * 2 });
  }

  const xs = layout.map((coin) => coin.x);
  const ys = layout.map((coin) => coin.y);
  const zs = layout.map((coin) => coin.z);
  const minX = Math.min(...xs) - radius;
  const maxX = Math.max(...xs) + radius;
  const minZ = Math.min(...zs) - radius;
  const maxZ = Math.max(...zs) + radius;
  const maxY = Math.max(...ys) + 0.035;

  return Object.freeze({
    centerX: (minX + maxX) / 2,
    centerY: maxY / 2,
    centerZ: (minZ + maxZ) / 2,
    width: maxX - minX,
    height: Math.max(0.12, maxY),
    depth: maxZ - minZ,
  });
}
