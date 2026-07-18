export function decisionClockKey(game) {
  return `${game.turn}|${game.phase}`;
}
