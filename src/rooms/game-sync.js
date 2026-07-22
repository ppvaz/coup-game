export const STATE_SYNC_RETRY_MS = 2_000;
export const BACKGROUND_STATE_SYNC_MS = 30_000;

export function shouldResetGame(currentGame, activeGameId) {
  return Boolean(activeGameId && currentGame?.gameId !== activeGameId);
}

export function shouldAcceptGameView(currentGame, incomingGame, activeGameId) {
  if (!incomingGame) return false;
  if (activeGameId && incomingGame.gameId !== activeGameId) return false;
  if (!currentGame) return true;
  if (currentGame.gameId !== incomingGame.gameId) return true;
  return incomingGame.version >= currentGame.version;
}

export function needsGameViewSync(room, game) {
  if (!room?.activeGameId) return false;
  return !game || game.gameId !== room.activeGameId || (room.status === 'finished' && game.status === 'playing');
}

export function needsBackgroundStateSync(room, game) {
  if (!room) return false;
  return room.status !== 'playing' || game?.status !== 'playing';
}

export function gameViewWithClock(view, clock, now = Date.now()) {
  const projected = { ...view };
  delete projected.clockRemaining;
  delete projected.clockTotal;
  if (view?.status !== 'playing') return projected;
  projected.clockRemaining = Math.max(0, clock.deadline - now);
  projected.clockTotal = Math.max(1, clock.total);
  return projected;
}

export function shouldRequestStateSync({
  room,
  game,
  clock,
  lastRequestAt = 0,
  now = Date.now(),
  force = false,
  retryMs = STATE_SYNC_RETRY_MS,
}) {
  if (!room) return false;
  const expiredGameClock = game?.status === 'playing' && clock?.deadline && clock.deadline <= now;
  if (!force && !expiredGameClock) return false;
  return !lastRequestAt || now - lastRequestAt >= retryMs;
}
