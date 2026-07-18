const SESSION_KEY = 'la-corte-online-session';
export const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000;

const migrateCard = (card) => {
  if (!card || card.role !== 'Embaixador') return card;
  return {
    ...card,
    id: typeof card.id === 'string' ? card.id.replace('Embaixador', 'Embaixadora') : card.id,
    role: 'Embaixadora',
  };
};

const migrateLegacyGame = (game) => {
  if (!game) return game;
  const migrated = { ...game };
  if (game.players)
    migrated.players = game.players.map((player) => ({ ...player, cards: player.cards?.map(migrateCard) }));
  if (game.deck) migrated.deck = game.deck.map(migrateCard);
  if (game.exchangeOptions) migrated.exchangeOptions = game.exchangeOptions.map(migrateCard);
  if (game.pending)
    migrated.pending = {
      ...game.pending,
      claimedRole: game.pending.claimedRole === 'Embaixador' ? 'Embaixadora' : game.pending.claimedRole,
      block: game.pending.block
        ? {
            ...game.pending.block,
            role: game.pending.block.role === 'Embaixador' ? 'Embaixadora' : game.pending.block.role,
          }
        : game.pending.block,
    };
  if (game.log)
    migrated.log = game.log.map((entry) => ({
      ...entry,
      role: entry.role === 'Embaixador' ? 'Embaixadora' : entry.role,
      claimedRole: entry.claimedRole === 'Embaixador' ? 'Embaixadora' : entry.claimedRole,
    }));
  return migrated;
};

export function saveOnlineSession(storage, snapshot, now = Date.now()) {
  if (!storage || !snapshot?.code || !snapshot?.myId || !snapshot?.name) return;
  try {
    storage.setItem(SESSION_KEY, JSON.stringify({ ...snapshot, savedAt: now }));
  } catch {
    // Alguns navegadores bloqueiam storage em modo privado. A partida continua,
    // apenas sem retomada automática após um reload.
  }
}

export function loadOnlineSession(storage, code, now = Date.now()) {
  if (!storage || !code) return null;
  try {
    const snapshot = JSON.parse(storage.getItem(SESSION_KEY));
    const valid =
      snapshot &&
      snapshot.code === code &&
      typeof snapshot.myId === 'string' &&
      typeof snapshot.name === 'string' &&
      snapshot.room?.code === code &&
      now - snapshot.savedAt <= SESSION_MAX_AGE_MS;
    return valid ? { ...snapshot, game: migrateLegacyGame(snapshot.game) } : null;
  } catch {
    return null;
  }
}

export function clearOnlineSession(storage) {
  try {
    storage?.removeItem(SESSION_KEY);
  } catch {
    // Sem ação: o storage já está indisponível.
  }
}
