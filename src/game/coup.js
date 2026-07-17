export const ROLES = ['Duque', 'Assassina', 'Capitão', 'Embaixador', 'Condessa'];

export const ACTIONS = {
  income: { label: 'Renda', coins: 1 },
  foreign_aid: { label: 'Ajuda externa', coins: 2, blockedBy: ['Duque'] },
  coup: { label: 'Golpe', cost: 7, targeted: true },
  tax: { label: 'Imposto', role: 'Duque', coins: 3 },
  assassinate: { label: 'Assassinar', role: 'Assassina', cost: 3, targeted: true, blockedBy: ['Condessa'] },
  steal: { label: 'Roubar', role: 'Capitão', targeted: true, blockedBy: ['Capitão', 'Embaixador'] },
  exchange: { label: 'Trocar', role: 'Embaixador' },
};

const clone = (value) => structuredClone(value);
const activeCards = (player) => player.cards.filter((card) => !card.revealed);
export const isAlive = (player) => activeCards(player).length > 0;
export const activePlayers = (state) => state.players.filter(isAlive);
export const currentPlayer = (state) => state.players.find((player) => player.id === state.currentPlayerId);

export function createDeck(random = Math.random) {
  const cards = ROLES.flatMap((role) => [0, 1, 2].map((copy) => ({ id: `${role}-${copy}`, role, revealed: false })));
  for (let index = cards.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [cards[index], cards[swap]] = [cards[swap], cards[index]];
  }
  return cards;
}

export function createGame(seats, options = {}) {
  if (seats.length < 2 || seats.length > 6) throw new Error('Coup requer entre 2 e 6 jogadores.');
  const deck = createDeck(options.random);
  const players = seats.map((seat) => ({
    id: seat.id,
    name: seat.name,
    kind: seat.kind ?? 'human',
    connected: seat.connected ?? true,
    coins: 2,
    cards: [deck.pop(), deck.pop()],
  }));
  return {
    version: 1,
    status: 'playing',
    phase: 'turn',
    players,
    deck,
    currentPlayerId: players[0].id,
    turn: 1,
    pending: null,
    responseQueue: [],
    exchangeOptions: [],
    winnerId: null,
    log: [{ type: 'game_started', at: Date.now() }],
  };
}

function assertActor(state, actorId) {
  const actor = state.players.find((player) => player.id === actorId);
  if (!actor || !isAlive(actor)) throw new Error('Jogador inválido ou eliminado.');
  return actor;
}

function nextPlayerId(state, afterId) {
  const start = state.players.findIndex((player) => player.id === afterId);
  for (let distance = 1; distance <= state.players.length; distance++) {
    const player = state.players[(start + distance) % state.players.length];
    if (isAlive(player)) return player.id;
  }
  return afterId;
}

function finishTurn(state) {
  const living = activePlayers(state);
  if (living.length === 1) {
    state.status = 'finished';
    state.phase = 'finished';
    state.winnerId = living[0].id;
    state.pending = null;
    state.responseQueue = [];
    state.log.push({ type: 'game_finished', winnerId: living[0].id, at: Date.now() });
    return;
  }
  state.currentPlayerId = nextPlayerId(state, state.currentPlayerId);
  state.turn += 1;
  state.phase = 'turn';
  state.pending = null;
  state.responseQueue = [];
}

function runAfterLoss(state, afterLoss) {
  if (afterLoss === 'continue_action') return beginBlocksOrResolve(state);
  if (afterLoss === 'resolve_action') return resolveAction(state);
  if (afterLoss === 'action_blocked') {
    state.log.push({ type: 'action_blocked', ...state.pending.block, at: Date.now() });
    return finishTurn(state);
  }
  return finishTurn(state);
}

// Quem perde influência escolhe qual carta revelar; com uma só carta viva
// não há escolha, então a revelação é imediata e a continuação já executa.
function loseInfluence(state, playerId, afterLoss) {
  const player = state.players.find((candidate) => candidate.id === playerId);
  const active = activeCards(player);
  if (active.length === 1) {
    active[0].revealed = true;
    state.log.push({ type: 'influence_lost', playerId, role: active[0].role, at: Date.now() });
    return runAfterLoss(state, afterLoss);
  }
  state.phase = 'choose_influence';
  state.pending.lossPlayerId = playerId;
  state.pending.afterLoss = afterLoss;
}

function responderIds(state, actorId) {
  return state.players.filter((player) => player.id !== actorId && isAlive(player)).map((player) => player.id);
}

function resolveAction(state) {
  const pending = state.pending;
  const actor = assertActor(state, pending.actorId);
  const target = pending.targetId == null ? null : state.players.find((player) => player.id === pending.targetId);
  if (target && !isAlive(target)) {
    state.log.push({ type: 'action_fizzled', action: pending.action, actorId: actor.id, targetId: target.id, at: Date.now() });
    return finishTurn(state);
  }
  switch (pending.action) {
    case 'income': actor.coins += 1; break;
    case 'foreign_aid': actor.coins += 2; break;
    case 'tax': actor.coins += 3; break;
    case 'steal': {
      const amount = Math.min(2, target.coins);
      target.coins -= amount;
      actor.coins += amount;
      break;
    }
    case 'coup':
    case 'assassinate':
      loseInfluence(state, target.id, 'finish_turn');
      return;
    case 'exchange': {
      const count = activeCards(actor).length;
      state.exchangeOptions = [...activeCards(actor), state.deck.pop(), state.deck.pop()].filter(Boolean);
      state.phase = 'exchange';
      state.pending.exchangeCount = count;
      return;
    }
  }
  state.log.push({ type: 'action_resolved', action: pending.action, actorId: actor.id, targetId: target?.id, at: Date.now() });
  finishTurn(state);
}

function beginBlocksOrResolve(state) {
  const action = ACTIONS[state.pending.action];
  if (!action.blockedBy) return resolveAction(state);
  // O contestador pode ter sido eliminado ao perder a contestação; um morto não bloqueia.
  const blockers = (state.pending.targetId == null
    ? responderIds(state, state.pending.actorId)
    : [state.pending.targetId]).filter((id) => isAlive(state.players.find((player) => player.id === id)));
  if (!blockers.length) return resolveAction(state);
  state.phase = 'block';
  state.responseQueue = blockers;
}

function proveRole(state, playerId, role) {
  const player = assertActor(state, playerId);
  const card = activeCards(player).find((candidate) => candidate.role === role);
  if (!card) return false;
  player.cards = player.cards.filter((candidate) => candidate.id !== card.id);
  card.revealed = false;
  state.deck.push(card);
  for (let index = state.deck.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [state.deck[index], state.deck[swap]] = [state.deck[swap], state.deck[index]];
  }
  player.cards.push(state.deck.pop());
  return true;
}

export function dispatchGame(source, command) {
  const state = clone(source);
  if (state.status !== 'playing') throw new Error('A partida não está em andamento.');
  const actor = assertActor(state, command.actorId);

  if (command.type === 'declare_action') {
    if (state.phase !== 'turn' || command.actorId !== state.currentPlayerId) throw new Error('Não é o turno deste jogador.');
    const action = ACTIONS[command.action];
    if (!action) throw new Error('Ação desconhecida.');
    if (actor.coins >= 10 && command.action !== 'coup') throw new Error('Com 10 moedas ou mais, o Golpe é obrigatório.');
    if (action.cost && actor.coins < action.cost) throw new Error('Moedas insuficientes.');
    if (action.targeted) {
      if (command.targetId === actor.id) throw new Error('O jogador não pode escolher a si mesmo.');
      assertActor(state, command.targetId);
    }
    if (command.action === 'steal' && state.players.find((p) => p.id === command.targetId).coins === 0) throw new Error('O alvo não possui moedas.');
    if (action.cost) actor.coins -= action.cost;
    state.pending = { action: command.action, actorId: actor.id, targetId: command.targetId ?? null, claimedRole: action.role ?? null };
    state.log.push({ type: 'action_declared', action: command.action, actorId: actor.id, targetId: command.targetId, at: Date.now() });
    if (command.action === 'income' || command.action === 'coup') resolveAction(state);
    else if (action.role) {
      state.phase = 'challenge_action';
      state.responseQueue = responderIds(state, actor.id);
    } else beginBlocksOrResolve(state);
    return state;
  }

  if (command.type === 'pass') {
    if (!['challenge_action', 'block', 'challenge_block'].includes(state.phase)) throw new Error('Não há resposta pendente.');
    if (state.responseQueue[0] !== actor.id) throw new Error('Este jogador não é o próximo a responder.');
    state.responseQueue.shift();
    if (state.responseQueue.length) return state;
    if (state.phase === 'challenge_action') beginBlocksOrResolve(state);
    else if (state.phase === 'block') resolveAction(state);
    else {
      state.log.push({ type: 'action_blocked', ...state.pending.block, at: Date.now() });
      finishTurn(state);
    }
    return state;
  }

  if (command.type === 'challenge') {
    if (!['challenge_action', 'challenge_block'].includes(state.phase)) throw new Error('Não há alegação contestável.');
    if (state.responseQueue[0] !== actor.id) throw new Error('Este jogador não é o próximo a responder.');
    const challengedId = state.phase === 'challenge_action' ? state.pending.actorId : state.pending.block.playerId;
    const claimedRole = state.phase === 'challenge_action' ? state.pending.claimedRole : state.pending.block.role;
    const truthful = proveRole(state, challengedId, claimedRole);
    state.log.push({ type: 'challenge_resolved', challengerId: actor.id, challengedId, claimedRole, truthful, at: Date.now() });
    const onAction = state.phase === 'challenge_action';
    if (truthful) loseInfluence(state, actor.id, onAction ? 'continue_action' : 'action_blocked');
    else loseInfluence(state, challengedId, onAction ? 'finish_turn' : 'resolve_action');
    return state;
  }

  if (command.type === 'block') {
    if (state.phase !== 'block' || state.responseQueue[0] !== actor.id) throw new Error('Este jogador não pode bloquear agora.');
    const allowed = ACTIONS[state.pending.action].blockedBy ?? [];
    if (!allowed.includes(command.role)) throw new Error('Esse personagem não bloqueia esta ação.');
    state.pending.block = { playerId: actor.id, role: command.role };
    state.phase = 'challenge_block';
    state.responseQueue = responderIds(state, actor.id);
    state.log.push({ type: 'block_declared', playerId: actor.id, role: command.role, at: Date.now() });
    return state;
  }

  if (command.type === 'reveal_influence') {
    if (state.phase !== 'choose_influence' || state.pending.lossPlayerId !== actor.id) throw new Error('Este jogador não deve revelar uma influência agora.');
    const card = actor.cards.find((candidate) => candidate.id === command.cardId && !candidate.revealed);
    if (!card) throw new Error('Influência inválida.');
    card.revealed = true;
    state.log.push({ type: 'influence_lost', playerId: actor.id, role: card.role, at: Date.now() });
    const afterLoss = state.pending.afterLoss;
    state.pending.lossPlayerId = null;
    state.pending.afterLoss = null;
    runAfterLoss(state, afterLoss);
    return state;
  }

  if (command.type === 'choose_exchange') {
    if (state.phase !== 'exchange' || state.pending.actorId !== actor.id) throw new Error('Este jogador não está trocando cartas.');
    if (command.cardIds.length !== state.pending.exchangeCount || new Set(command.cardIds).size !== command.cardIds.length) throw new Error('Quantidade inválida de cartas.');
    const chosen = command.cardIds.map((id) => state.exchangeOptions.find((card) => card.id === id));
    if (chosen.some((card) => !card)) throw new Error('Carta inválida na troca.');
    const revealed = actor.cards.filter((card) => card.revealed);
    const returned = state.exchangeOptions.filter((card) => !command.cardIds.includes(card.id));
    actor.cards = [...revealed, ...chosen];
    state.deck.push(...returned.map((card) => ({ ...card, revealed: false })));
    state.exchangeOptions = [];
    state.log.push({ type: 'exchange_resolved', playerId: actor.id, at: Date.now() });
    finishTurn(state);
    return state;
  }

  throw new Error('Comando desconhecido.');
}

export function viewForPlayer(state, viewerId) {
  const view = clone(state);
  view.players = view.players.map((player) => ({
    ...player,
    cards: player.cards.map((card, index) => player.id === viewerId || card.revealed
      ? card
      : { id: `hidden-${player.id}-${index}`, role: null, revealed: false }),
  }));
  view.deck = view.deck.map((_, index) => ({ id: `deck-${index}`, role: null, revealed: false }));
  if (state.pending?.actorId !== viewerId) view.exchangeOptions = [];
  return view;
}
