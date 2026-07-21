const BOT_DELAY = [2_800, 3_600];

export function botDelayMs(random = Math.random) {
  const [minimum, maximum] = BOT_DELAY;
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}
