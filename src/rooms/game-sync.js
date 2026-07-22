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

export function gameViewWithClock(view, clock, now = Date.now()) {
  const projected = { ...view };
  delete projected.clockRemaining;
  delete projected.clockTotal;
  if (view?.status !== 'playing') return projected;
  projected.clockRemaining = Math.max(0, clock.deadline - now);
  projected.clockTotal = Math.max(1, clock.total);
  return projected;
}
