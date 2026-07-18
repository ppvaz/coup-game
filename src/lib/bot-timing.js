const BOT_DELAY = [1_800, 2_400];

export function botDelayMs(random = Math.random) {
  const [minimum, maximum] = BOT_DELAY;
  return minimum + Math.floor(random() * (maximum - minimum + 1));
}
