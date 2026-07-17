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
