const SESSION_KEY = 'la-corte-online-session';
export const SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000;

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
    return valid ? snapshot : null;
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
