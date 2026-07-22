export const TABLETOP_COMPOSITIONS = Object.freeze({
  classic: Object.freeze({ id: 'classic', label: 'Salão' }),
  council: Object.freeze({ id: 'council', label: 'Conselho' }),
});

export function tabletopCompositionFromSearch(search, { allowExperimental = false } = {}) {
  if (!allowExperimental) return TABLETOP_COMPOSITIONS.classic;
  const requested = new URLSearchParams(search).get('composition');
  return TABLETOP_COMPOSITIONS[requested] ?? TABLETOP_COMPOSITIONS.classic;
}

export function nextTabletopComposition(id) {
  return id === 'council' ? TABLETOP_COMPOSITIONS.classic : TABLETOP_COMPOSITIONS.council;
}

export async function loadTabletopComposition(id) {
  if (id === 'council') return import('./compositions/council/scene.js');
  return import('./coup-table.js');
}
