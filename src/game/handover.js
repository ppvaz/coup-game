import { ROLES } from './coup.js';

// Reconstrói o estado completo da partida quando o anfitrião cai: o sucessor
// parte da própria vista (redigida) e recebe a vista de cada sobrevivente, que
// conhece as próprias cartas. Cartas de quem não respondeu são sorteadas do
// conjunto desconhecido — para a mesa, indistinguível do real — e o baralho é
// reembaralhado, o que é neutro porque a ordem dele nunca foi pública.
export function reconstructGame(successorId, ownView, handovers, random = Math.random) {
  const state = structuredClone(ownView);
  delete state.clockRemaining;
  delete state.clockTotal;

  const known = new Map();
  known.set(
    successorId,
    state.players.find((player) => player.id === successorId).cards,
  );
  for (const { playerId, view } of handovers) {
    const publicCards = state.players.find((player) => player.id === playerId)?.cards;
    const cards = view?.players?.find?.((player) => player.id === playerId)?.cards;
    // Vistas chegam pela rede: só aceita mãos consistentes com o que é público.
    const valid =
      publicCards &&
      Array.isArray(cards) &&
      cards.length === publicCards.length &&
      cards.every(
        (card, index) =>
          ROLES.includes(card?.role) &&
          Boolean(card.revealed) === Boolean(publicCards[index].revealed) &&
          (!publicCards[index].revealed || publicCards[index].role === card.role),
      );
    if (valid) known.set(playerId, cards);
  }

  const pool = ROLES.flatMap((role) => [role, role, role]);
  const removeFromPool = (role) => {
    const index = pool.indexOf(role);
    if (index >= 0) pool.splice(index, 1);
  };
  for (const player of state.players) {
    for (const card of known.get(player.id) ?? player.cards) if (card.role) removeFromPool(card.role);
  }

  let serial = 0;
  const draw = () => {
    const role = pool.splice(Math.floor(random() * pool.length), 1)[0];
    return { id: `${role}-h${serial++}`, role, revealed: false };
  };
  for (const player of state.players) {
    if (known.has(player.id)) player.cards = known.get(player.id);
    else player.cards = player.cards.map((card) => (card.role ? card : draw()));
  }
  state.deck = state.deck.map(() => draw());

  if (state.phase === 'exchange') {
    const actorId = state.pending.actorId;
    const options =
      actorId === successorId
        ? state.exchangeOptions
        : handovers.find((handover) => handover.playerId === actorId)?.view?.exchangeOptions;
    // Sem o ator, as duas cartas compradas são exatamente o que sobrou no pool.
    state.exchangeOptions = options?.length
      ? options
      : [
          ...state.players.find((player) => player.id === actorId).cards.filter((card) => !card.revealed),
          draw(),
          draw(),
        ].filter((card) => card?.role);
  }
  return state;
}
