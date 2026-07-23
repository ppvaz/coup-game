// Como um jogador se apresenta à mesa. Dado puro de propósito: precisa ser
// testável, serializável e escolhível pelo jogador, sem tocar em Three nem no
// bundler. A partir daqui uma cadeira pode montar um Nobre da corte ou um
// Cultista — o mecanismo veio do Sem Perdão, mas cada acervo é do seu jogo.
//
// Invariante que atravessa os dois jogos (MOTOR-COMPARTILHADO §"Invariantes"):
// o cosmético nunca revela estado oculto. Nenhum adorno pode imitar os cinco
// papéis nem insinuar uma influência secreta.

import { ROBES, NOBLE_SKINS } from './appearance.js';

/** Escolhe determinística e estável a partir de um índice de assento. */
const pick = (list, index) => list[((index % list.length) + list.length) % list.length];
const keys = (map) => Object.freeze(Object.keys(map));

// --- Nobre: herda a paleta atual da corte para não mudar o visual existente ---

const NOBLE_ROBES = Object.freeze({
  garnet: ROBES[0],
  teal: ROBES[1],
  olive: ROBES[2],
  plum: ROBES[3],
  forest: ROBES[4],
  umber: ROBES[5],
});

const NOBLE_SKIN = Object.freeze({
  tan: NOBLE_SKINS[0],
  deep: NOBLE_SKINS[1],
  fair: NOBLE_SKINS[2],
});

const NOBLE_HAIR = Object.freeze({
  raven: 0x1b1613,
  chestnut: 0x3a241a,
  auburn: 0x5a2a1c,
  ash: 0x6d6459,
  silver: 0xc9c1b0,
});

// Adornos deliberadamente genéricos: nada de coroa, adaga, dragonas, carta ou
// gola alta que ecoe Duque, Assassina, Capitão, Embaixadora ou Condessa.
const NOBLE_ADORNOS = Object.freeze(['none', 'sash', 'pendant', 'shawl']);

// --- Cultista: acervo do Sem Perdão (reus.ts / aparencia.ts) ---

const CULTIST_ROBES = Object.freeze({
  blood: 0x8f201b,
  ash: 0x625d63,
  midnight: 0x25243a,
  moss: 0x48563b,
  violet: 0x4a2a5e,
  rust: 0x8a4c1f,
  abyss: 0x1e4744,
  linen: 0xb3a98f,
});

const CULTIST_ACCENTS = Object.freeze({
  bone: 0xd8ccb2,
  brass: 0xa97d3e,
  scarlet: 0xff3b2f,
  cyan: 0x43d9d4,
  gold: 0xe3b341,
  amethyst: 0xa06bff,
});

const CULTIST_HOODS = Object.freeze(['classic', 'spire', 'shrouded']);
const CULTIST_FACES = Object.freeze(['void', 'ember', 'grin', 'weeping']);
const CULTIST_RELICS = Object.freeze(['none', 'chain', 'candle', 'relic']);

// `cultist-blender` fica reservado para o remodelado WIP; enquanto o asset não
// chega, só o clássico é selecionável.
export const CHARACTER_FIGURES = Object.freeze(['noble', 'cultist']);

const NOBLE_ROBE_KEYS = keys(NOBLE_ROBES);
const NOBLE_SKIN_KEYS = keys(NOBLE_SKIN);
const NOBLE_HAIR_KEYS = keys(NOBLE_HAIR);
const CULTIST_ROBE_KEYS = keys(CULTIST_ROBES);
const CULTIST_ACCENT_KEYS = keys(CULTIST_ACCENTS);

const DEFAULT_NOBLE = Object.freeze({ robe: 'garnet', skin: 'tan', hair: 'raven', adorno: 'none' });
const DEFAULT_CULTIST = Object.freeze({ robe: 'blood', hood: 'classic', face: 'void', accent: 'bone', relic: 'none' });

export const DEFAULT_CHARACTER = Object.freeze({
  figure: 'noble',
  noble: DEFAULT_NOBLE,
  cultist: DEFAULT_CULTIST,
});

export const CHARACTER_STORAGE_KEY = 'la-corte-character';

const inSet = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

function normalizeNoble(raw = {}) {
  return Object.freeze({
    robe: inSet(raw.robe, NOBLE_ROBE_KEYS, DEFAULT_NOBLE.robe),
    skin: inSet(raw.skin, NOBLE_SKIN_KEYS, DEFAULT_NOBLE.skin),
    hair: inSet(raw.hair, NOBLE_HAIR_KEYS, DEFAULT_NOBLE.hair),
    adorno: inSet(raw.adorno, NOBLE_ADORNOS, DEFAULT_NOBLE.adorno),
  });
}

function normalizeCultist(raw = {}) {
  return Object.freeze({
    robe: inSet(raw.robe, CULTIST_ROBE_KEYS, DEFAULT_CULTIST.robe),
    hood: inSet(raw.hood, CULTIST_HOODS, DEFAULT_CULTIST.hood),
    face: inSet(raw.face, CULTIST_FACES, DEFAULT_CULTIST.face),
    accent: inSet(raw.accent, CULTIST_ACCENT_KEYS, DEFAULT_CULTIST.accent),
    relic: inSet(raw.relic, CULTIST_RELICS, DEFAULT_CULTIST.relic),
  });
}

/** Garante um descritor válido, preservando os dois acervos ao trocar de figura. */
export function normalizeCharacter(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return Object.freeze({
    figure: inSet(source.figure, CHARACTER_FIGURES, DEFAULT_CHARACTER.figure),
    noble: normalizeNoble(source.noble),
    cultist: normalizeCultist(source.cultist),
  });
}

/**
 * Aparência padrão de uma cadeira. Determinística e defasada por atributo para
 * que dois vizinhos nunca repitam o conjunto — a mesma garantia que o assento
 * dava antes, agora expressa como personagem completo.
 */
export function characterForSeat(index = 0) {
  const seat = Math.max(0, Math.trunc(Number(index) || 0));
  return normalizeCharacter({
    figure: 'noble',
    noble: {
      robe: pick(NOBLE_ROBE_KEYS, seat),
      skin: pick(NOBLE_SKIN_KEYS, seat),
      hair: pick(NOBLE_HAIR_KEYS, seat * 2 + 1),
      adorno: 'none',
    },
  });
}

const randomOf = (list) => list[Math.floor(Math.random() * list.length)];

export function randomCharacter() {
  return normalizeCharacter({
    figure: randomOf(CHARACTER_FIGURES),
    noble: {
      robe: randomOf(NOBLE_ROBE_KEYS),
      skin: randomOf(NOBLE_SKIN_KEYS),
      hair: randomOf(NOBLE_HAIR_KEYS),
      adorno: randomOf(NOBLE_ADORNOS),
    },
    cultist: {
      robe: randomOf(CULTIST_ROBE_KEYS),
      hood: randomOf(CULTIST_HOODS),
      face: randomOf(CULTIST_FACES),
      accent: randomOf(CULTIST_ACCENT_KEYS),
      relic: randomOf(CULTIST_RELICS),
    },
  });
}

/**
 * Converte o descritor (chaves) nos parâmetros concretos que os construtores 3D
 * consomem — cores em hex e enums de forma. A barreira entre dado e malha.
 */
export function resolveCharacter(appearance) {
  const character = normalizeCharacter(appearance);
  if (character.figure === 'cultist') {
    const cultist = character.cultist;
    return Object.freeze({
      figure: 'cultist',
      robe: CULTIST_ROBES[cultist.robe],
      hood: cultist.hood,
      face: cultist.face,
      accent: CULTIST_ACCENTS[cultist.accent],
      relic: cultist.relic,
    });
  }
  const noble = character.noble;
  return Object.freeze({
    figure: 'noble',
    robe: NOBLE_ROBES[noble.robe],
    skin: NOBLE_SKIN[noble.skin],
    hair: NOBLE_HAIR[noble.hair],
    adorno: noble.adorno,
  });
}

const hex = (value) => `#${value.toString(16).padStart(6, '0')}`;
const colorOptions = (map) => Object.entries(map).map(([value, color]) => ({ value, swatch: hex(color) }));
const plainOptions = (values, labels) => values.map((value) => ({ value, label: labels[value] }));

const NOBLE_ADORNO_LABELS = { none: 'Nenhum', sash: 'Faixa', pendant: 'Pingente', shawl: 'Xale' };
const NOBLE_ROBE_LABELS = {
  garnet: 'Granada',
  teal: 'Turquesa',
  olive: 'Oliva',
  plum: 'Ameixa',
  forest: 'Floresta',
  umber: 'Umbra',
};
const NOBLE_SKIN_LABELS = { tan: 'Bronze', deep: 'Ébano', fair: 'Clara' };
const NOBLE_HAIR_LABELS = { raven: 'Corvo', chestnut: 'Castanho', auburn: 'Acaju', ash: 'Grisalho', silver: 'Prata' };

const CULTIST_ROBE_LABELS = {
  blood: 'Sangue',
  ash: 'Cinza',
  midnight: 'Meia-noite',
  moss: 'Musgo',
  violet: 'Púrpura',
  rust: 'Ferrugem',
  abyss: 'Abissal',
  linen: 'Linho',
};
const CULTIST_HOOD_LABELS = { classic: 'Clássico', spire: 'Agulha', shrouded: 'Mortalha' };
const CULTIST_FACE_LABELS = { void: 'Vazio', ember: 'Brasa', grin: 'Riso', weeping: 'Lágrimas' };
const CULTIST_ACCENT_LABELS = {
  bone: 'Osso',
  brass: 'Latão',
  scarlet: 'Escarlate',
  cyan: 'Ciano',
  gold: 'Ouro',
  amethyst: 'Ametista',
};
const CULTIST_RELIC_LABELS = { none: 'Nenhuma', chain: 'Corrente', candle: 'Vela', relic: 'Relicário' };

const withLabels = (options, labels) => options.map((option) => ({ ...option, label: labels[option.value] }));

/** Catálogo curado para a UI de customização, por figura. */
export const CHARACTER_GROUPS = Object.freeze({
  noble: Object.freeze([
    Object.freeze({ key: 'robe', label: 'Manto', options: withLabels(colorOptions(NOBLE_ROBES), NOBLE_ROBE_LABELS) }),
    Object.freeze({ key: 'skin', label: 'Pele', options: withLabels(colorOptions(NOBLE_SKIN), NOBLE_SKIN_LABELS) }),
    Object.freeze({ key: 'hair', label: 'Cabelo', options: withLabels(colorOptions(NOBLE_HAIR), NOBLE_HAIR_LABELS) }),
    Object.freeze({ key: 'adorno', label: 'Adorno', options: plainOptions(NOBLE_ADORNOS, NOBLE_ADORNO_LABELS) }),
  ]),
  cultist: Object.freeze([
    Object.freeze({
      key: 'robe',
      label: 'Robe',
      options: withLabels(colorOptions(CULTIST_ROBES), CULTIST_ROBE_LABELS),
    }),
    Object.freeze({ key: 'hood', label: 'Capuz', options: plainOptions(CULTIST_HOODS, CULTIST_HOOD_LABELS) }),
    Object.freeze({ key: 'face', label: 'Sigilo', options: plainOptions(CULTIST_FACES, CULTIST_FACE_LABELS) }),
    Object.freeze({
      key: 'accent',
      label: 'Metal',
      options: withLabels(colorOptions(CULTIST_ACCENTS), CULTIST_ACCENT_LABELS),
    }),
    Object.freeze({ key: 'relic', label: 'Relíquia', options: plainOptions(CULTIST_RELICS, CULTIST_RELIC_LABELS) }),
  ]),
});

export const CHARACTER_FIGURE_LABELS = Object.freeze({ noble: 'Nobre', cultist: 'Cultista' });

export function loadCharacter() {
  if (typeof window === 'undefined') return DEFAULT_CHARACTER;
  try {
    const saved = window.localStorage.getItem(CHARACTER_STORAGE_KEY);
    return normalizeCharacter(saved ? JSON.parse(saved) : null);
  } catch {
    return DEFAULT_CHARACTER;
  }
}

export function saveCharacter(appearance) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CHARACTER_STORAGE_KEY, JSON.stringify(normalizeCharacter(appearance)));
  } catch {
    // storage cheio/bloqueado: a escolha só não sobrevive ao reload.
  }
}
