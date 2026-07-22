export const LOCAL_BOT_NAMES = Object.freeze(['Lorenzo', 'Beatrice', 'Vittorio', 'Isabella', 'Catarina']);
export const LOCAL_BOT_COUNTS = Object.freeze(LOCAL_BOT_NAMES.map((_, index) => index + 1));
export const DEFAULT_LOCAL_BOT_COUNT = 3;

export function normalizeLocalBotCount(value) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed)
    ? Math.max(LOCAL_BOT_COUNTS[0], Math.min(LOCAL_BOT_COUNTS.at(-1), parsed))
    : DEFAULT_LOCAL_BOT_COUNT;
}

export function localBotSeats(playerName, botCount = DEFAULT_LOCAL_BOT_COUNT) {
  const count = normalizeLocalBotCount(botCount);
  return [
    { id: 'me', name: playerName, kind: 'human' },
    ...LOCAL_BOT_NAMES.slice(0, count).map((name, index) => ({ id: `bot-${index}`, name, kind: 'bot' })),
  ];
}
