import { channelStatusOutcome } from '../lib/realtime.js';

// Sequência de assinatura do canal da sala. A ordem e as guardas em volta do
// await moram aqui; os efeitos chegam injetados, o que torna o fluxo testável
// sem Supabase. `isCurrent` protege contra canal trocado durante a espera da
// presença; a primeira assinatura abre create/resume/join, e uma reassinatura
// (queda + retorno do canal) retoma a cadeira existente.
export function createSubscriptionHandler({ kind, isCurrent, hasRoom, track, effects }) {
  let subscribedOnce = false;
  return async (status) => {
    if (!isCurrent()) return;
    const outcome = channelStatusOutcome(status, hasRoom());
    if (outcome === 'reconnect') return effects.markReconnecting();
    if (outcome === 'fail') return effects.failConnection();
    if (outcome !== 'subscribed') return;

    const firstSubscription = !subscribedOnce;
    subscribedOnce = true;
    effects.markSubscribed();
    const presenceStatus = await track();
    if (!isCurrent()) return;
    if (presenceStatus === 'error') return effects.presenceFailed();

    if (!firstSubscription) return effects.reclaimSeat();
    if (kind === 'create') return effects.openCreatedRoom();
    if (kind === 'resume') return effects.resumeSeat();
    return effects.beginJoin();
  };
}
