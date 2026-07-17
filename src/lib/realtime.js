export const PRESENCE_ACK_TIMEOUT_MS = 2_500;

export async function trackPresence(channel, payload, timeoutMs = PRESENCE_ACK_TIMEOUT_MS) {
  let timeoutId;
  const result = Promise.resolve()
    .then(() => channel.track(payload))
    .then((status) => (status === 'ok' ? 'ok' : 'error'))
    .catch(() => 'error');
  const deadline = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve('pending'), timeoutMs);
  });

  const status = await Promise.race([result, deadline]);
  if (status !== 'pending') clearTimeout(timeoutId);
  return status;
}
