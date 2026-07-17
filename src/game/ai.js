import { ACTIONS, isAlive } from './coup.js';

const activeCards = (player) => player.cards.filter((card) => !card.revealed);

// Ordem de preferência para manter cartas (a última é a primeira a ser revelada/trocada).
const KEEP_PRIORITY = ['Duque', 'Condessa', 'Capitão', 'Assassino', 'Embaixador'];
const keepRank = (role) => KEEP_PRIORITY.indexOf(role);

export function awaitedPlayerId(state) {
  if (state.status !== 'playing') return null;
  if (state.phase === 'turn') return state.currentPlayerId;
  if (['challenge_action', 'block', 'challenge_block'].includes(state.phase)) return state.responseQueue[0] ?? null;
  if (state.phase === 'choose_influence') return state.pending.lossPlayerId;
  if (state.phase === 'exchange') return state.pending.actorId;
  return null;
}

export function botCommand(state, botId, random = Math.random) {
  const bot = state.players.find((player) => player.id === botId);
  switch (state.phase) {
    case 'turn': return declareCommand(state, bot, random);
    case 'challenge_action': return challengeOrPass(state, bot, state.pending.claimedRole, random);
    case 'challenge_block': return challengeOrPass(state, bot, state.pending.block.role, random);
    case 'block': return blockOrPass(state, bot, random);
    case 'choose_influence': return { type: 'reveal_influence', actorId: bot.id, cardId: chooseLoss(bot) };
    case 'exchange': return { type: 'choose_exchange', actorId: bot.id, cardIds: chooseExchange(state) };
    default: throw new Error(`Bot sem jogada para a fase ${state.phase}.`);
  }
}

function declareCommand(state, bot, random) {
  const rivals = state.players.filter((player) => player.id !== bot.id && isAlive(player));
  const weakest = [...rivals].sort((left, right) => activeCards(left).length - activeCards(right).length)[0];
  if (bot.coins >= 10 || (bot.coins >= 7 && random() > 0.45)) {
    return { type: 'declare_action', actorId: bot.id, action: 'coup', targetId: weakest.id };
  }
  const options = ['income', 'foreign_aid', 'tax', 'exchange'];
  const richRivals = rivals.filter((rival) => rival.coins > 0);
  if (richRivals.length) options.push('steal');
  if (bot.coins >= 3) options.push('assassinate');
  const action = options[Math.floor(random() * options.length)];
  if (!ACTIONS[action].targeted) return { type: 'declare_action', actorId: bot.id, action };
  const pool = action === 'steal' ? richRivals : rivals;
  return { type: 'declare_action', actorId: bot.id, action, targetId: pool[Math.floor(random() * pool.length)].id };
}

function challengeOrPass(state, bot, claimedRole, random) {
  const revealedCopies = state.players.flatMap((player) => player.cards).filter((card) => card.revealed && card.role === claimedRole).length;
  const held = activeCards(bot).filter((card) => card.role === claimedRole).length;
  const evidence = held + revealedCopies;
  let chance = evidence >= 3 ? 1 : evidence === 2 ? 0.68 : evidence === 1 ? 0.22 : 0.1;
  if (activeCards(bot).length === 1) chance *= 0.58;
  return random() < chance ? { type: 'challenge', actorId: bot.id } : { type: 'pass', actorId: bot.id };
}

function blockOrPass(state, bot, random) {
  const roles = ACTIONS[state.pending.action].blockedBy ?? [];
  const real = activeCards(bot).find((card) => roles.includes(card.role));
  const cornered = state.pending.action === 'assassinate' && activeCards(bot).length === 1;
  const chance = real ? 0.72 : cornered ? 0.5 : 0.13;
  if (random() >= chance) return { type: 'pass', actorId: bot.id };
  const role = real ? real.role : roles[Math.floor(random() * roles.length)];
  return { type: 'block', actorId: bot.id, role };
}

function chooseLoss(bot) {
  return [...activeCards(bot)].sort((left, right) => keepRank(right.role) - keepRank(left.role))[0].id;
}

function chooseExchange(state) {
  const count = state.pending.exchangeCount;
  const sorted = [...state.exchangeOptions].sort((left, right) => keepRank(left.role) - keepRank(right.role));
  const chosen = [];
  for (const card of sorted) if (chosen.length < count && !chosen.some((pick) => pick.role === card.role)) chosen.push(card);
  for (const card of sorted) if (chosen.length < count && !chosen.includes(card)) chosen.push(card);
  return chosen.map((card) => card.id);
}
