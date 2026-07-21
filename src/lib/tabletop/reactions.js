export const TABLETOP_EMOJIS = Object.freeze(['👏', '🤨', '😮', '😂', '🫡', '👀']);

export const TABLETOP_THROWABLES = Object.freeze([
  Object.freeze({ id: 'tomato', icon: '🍅', label: 'Tomate' }),
  Object.freeze({ id: 'glove', icon: '🧤', label: 'Luva' }),
  Object.freeze({ id: 'rose', icon: '🌹', label: 'Rosa' }),
  Object.freeze({ id: 'ambassador_card', icon: '✉️', label: 'Carta da Embaixadora' }),
  Object.freeze({ id: 'assassin_dagger', icon: '🗡️', label: 'Adaga da Assassina' }),
  Object.freeze({ id: 'duke_coin', icon: '🪙', label: 'Moeda do Duque' }),
  Object.freeze({ id: 'hourglass', icon: '⏳', label: 'Ampulheta' }),
]);

const THROWABLE_IDS = new Set(TABLETOP_THROWABLES.map((item) => item.id));
const EMOJI_IDS = new Set(TABLETOP_EMOJIS);

const shortId = (value) => {
  const normalized = String(value ?? '').slice(0, 80);
  return normalized || null;
};

export function normalizeTabletopReaction(value, { playerIds = [] } = {}) {
  if (!value || typeof value !== 'object') return null;
  const id = shortId(value.id);
  const playerId = shortId(value.playerId);
  const allowed = new Set(playerIds.map(String));
  if (!id || !playerId || (allowed.size && !allowed.has(playerId))) return null;

  const sentAt = Number(value.sentAt);
  if (!Number.isFinite(sentAt) || sentAt <= 0) return null;

  if (value.kind === 'emoji' && EMOJI_IDS.has(value.emoji)) {
    return { id, kind: 'emoji', playerId, emoji: value.emoji, sentAt };
  }

  const targetId = shortId(value.targetId);
  if (
    value.kind === 'throw' &&
    THROWABLE_IDS.has(value.throwable) &&
    targetId &&
    targetId !== playerId &&
    (!allowed.size || allowed.has(targetId))
  ) {
    return { id, kind: 'throw', playerId, targetId, throwable: value.throwable, sentAt };
  }

  return null;
}

export function appendTabletopReaction(reactions, value, options) {
  const normalized = normalizeTabletopReaction(value, options);
  if (!normalized || reactions.some((reaction) => reaction.id === normalized.id)) return reactions;
  return [...reactions.slice(-23), normalized];
}
