export const PRESENCE_ACK_TIMEOUT_MS = 2_500;

// Mapeia o status do canal Supabase para a reação do app: cair do canal com
// uma sala em mãos é queda temporária (reconecta); sem sala é falha de
// entrada (volta ao salão com erro). Estados intermediários são ignorados.
export function channelStatusOutcome(status, hasRoom) {
  if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) return hasRoom ? 'reconnect' : 'fail';
  return status === 'SUBSCRIBED' ? 'subscribed' : 'ignore';
}

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
