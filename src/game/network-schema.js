import { ACTIONS, ROLES } from './coup.js';

const ACTION_IDS = new Set(Object.keys(ACTIONS));
const ROLE_IDS = new Set(ROLES);
const PHASES = new Set([
  'turn',
  'challenge_action',
  'block',
  'challenge_block',
  'choose_influence',
  'exchange',
  'finished',
]);
const LOG_TYPES = new Set([
  'game_started',
  'game_finished',
  'action_declared',
  'action_resolved',
  'action_fizzled',
  'challenge_resolved',
  'block_declared',
  'action_blocked',
  'influence_lost',
  'exchange_resolved',
]);
const AFTER_LOSS = new Set(['continue_action', 'resolve_action', 'action_blocked', 'finish_turn']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isRecord = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);
const isSafeInteger = (value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(value) && value >= minimum && value <= maximum;
const isId = (value) => typeof value === 'string' && value.length >= 1 && value.length <= 100;
const hasOnlyKeys = (value, allowed) => Object.keys(value).every((key) => allowed.includes(key));
const isMember = (value, playerIds) => isUuid(value) && playerIds.has(value);
const optionalMember = (value, playerIds) => value == null || isMember(value, playerIds);
const isPlayerName = (value) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  Array.from(value).length <= 18 &&
  !Array.from(value).some((character) => {
    const point = character.codePointAt(0);
    return point < 32 || point === 127;
  });

function isCard(value) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['id', 'role', 'revealed']) &&
    isId(value.id) &&
    (value.role === null || ROLE_IDS.has(value.role)) &&
    typeof value.revealed === 'boolean' &&
    (!value.revealed || ROLE_IDS.has(value.role))
  );
}

function isPlayer(value) {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['id', 'name', 'kind', 'connected', 'coins', 'cards']) &&
    isUuid(value.id) &&
    isPlayerName(value.name) &&
    ['human', 'bot'].includes(value.kind) &&
    typeof value.connected === 'boolean' &&
    isSafeInteger(value.coins, 0, 1_000_000) &&
    Array.isArray(value.cards) &&
    value.cards.length === 2 &&
    value.cards.every(isCard) &&
    new Set(value.cards.map((card) => card.id)).size === value.cards.length
  );
}

function isPending(value, playerIds) {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'action',
      'actorId',
      'targetId',
      'claimedRole',
      'paidCost',
      'block',
      'lossPlayerId',
      'afterLoss',
      'exchangeCount',
    ]) ||
    !ACTION_IDS.has(value.action) ||
    !isMember(value.actorId, playerIds) ||
    !optionalMember(value.targetId, playerIds) ||
    value.targetId === value.actorId ||
    !(value.claimedRole === null || ROLE_IDS.has(value.claimedRole)) ||
    !isSafeInteger(value.paidCost, 0, 7)
  )
    return false;

  const action = ACTIONS[value.action];
  if ((action.targeted && !value.targetId) || (!action.targeted && value.targetId != null)) return false;
  if ((action.role ?? null) !== value.claimedRole || (action.cost ?? 0) !== value.paidCost) return false;
  if (
    value.block !== undefined &&
    (!isRecord(value.block) ||
      !hasOnlyKeys(value.block, ['playerId', 'role']) ||
      !isMember(value.block.playerId, playerIds) ||
      !ROLE_IDS.has(value.block.role) ||
      !(action.blockedBy ?? []).includes(value.block.role))
  )
    return false;
  if (value.lossPlayerId !== undefined && value.lossPlayerId !== null && !isMember(value.lossPlayerId, playerIds))
    return false;
  if (value.afterLoss !== undefined && value.afterLoss !== null && !AFTER_LOSS.has(value.afterLoss)) return false;
  if (value.exchangeCount !== undefined && !isSafeInteger(value.exchangeCount, 1, 2)) return false;
  return true;
}

function isLogEntry(value, playerIds) {
  if (!isRecord(value) || !LOG_TYPES.has(value.type) || !isSafeInteger(value.at)) return false;
  const allowed = [
    'type',
    'at',
    'action',
    'actorId',
    'targetId',
    'playerId',
    'role',
    'challengerId',
    'challengedId',
    'claimedRole',
    'truthful',
    'winnerId',
    'reason',
    'loserId',
    'amount',
    'refundedCost',
  ];
  if (!hasOnlyKeys(value, allowed)) return false;
  if (value.action !== undefined && !ACTION_IDS.has(value.action)) return false;
  for (const key of ['actorId', 'targetId', 'playerId', 'challengerId', 'challengedId', 'winnerId', 'loserId']) {
    if (value[key] !== undefined && value[key] !== null && !isMember(value[key], playerIds)) return false;
  }
  if (value.role !== undefined && !ROLE_IDS.has(value.role)) return false;
  if (value.claimedRole !== undefined && !ROLE_IDS.has(value.claimedRole)) return false;
  if (value.truthful !== undefined && typeof value.truthful !== 'boolean') return false;
  if (value.reason !== undefined && !['last_survivor', 'humans_eliminated'].includes(value.reason)) return false;

  switch (value.type) {
    case 'game_started':
      return hasOnlyKeys(value, ['type', 'at']);
    case 'game_finished':
      return (
        hasOnlyKeys(value, ['type', 'winnerId', 'reason', 'loserId', 'at']) &&
        ['last_survivor', 'humans_eliminated'].includes(value.reason) &&
        (value.reason === 'last_survivor'
          ? isMember(value.winnerId, playerIds) && value.loserId === null
          : value.winnerId === null && isMember(value.loserId, playerIds))
      );
    case 'action_declared':
    case 'action_fizzled': {
      if (!hasOnlyKeys(value, ['type', 'action', 'actorId', 'targetId', 'at'])) return false;
      if (!ACTION_IDS.has(value.action) || !isMember(value.actorId, playerIds)) return false;
      return ACTIONS[value.action].targeted
        ? isMember(value.targetId, playerIds) && value.targetId !== value.actorId
        : value.targetId === undefined;
    }
    case 'action_resolved': {
      if (!hasOnlyKeys(value, ['type', 'action', 'actorId', 'targetId', 'amount', 'at'])) return false;
      if (!ACTION_IDS.has(value.action) || !isMember(value.actorId, playerIds)) return false;
      const targetValid = ACTIONS[value.action].targeted
        ? isMember(value.targetId, playerIds) && value.targetId !== value.actorId
        : value.targetId === undefined;
      if (!targetValid || value.amount === undefined) return targetValid;
      if (!isSafeInteger(value.amount, 1, 3)) return false;
      return value.action === 'steal' ? value.amount <= 2 : value.amount === ACTIONS[value.action].coins;
    }
    case 'challenge_resolved':
      return (
        hasOnlyKeys(value, ['type', 'challengerId', 'challengedId', 'claimedRole', 'truthful', 'refundedCost', 'at']) &&
        isMember(value.challengerId, playerIds) &&
        isMember(value.challengedId, playerIds) &&
        value.challengerId !== value.challengedId &&
        ROLE_IDS.has(value.claimedRole) &&
        typeof value.truthful === 'boolean' &&
        (value.refundedCost === undefined || isSafeInteger(value.refundedCost, 0, 7))
      );
    case 'block_declared':
    case 'action_blocked':
      return (
        hasOnlyKeys(value, ['type', 'action', 'playerId', 'role', 'at']) &&
        ACTION_IDS.has(value.action) &&
        isMember(value.playerId, playerIds) &&
        (ACTIONS[value.action].blockedBy ?? []).includes(value.role)
      );
    case 'influence_lost':
      return (
        hasOnlyKeys(value, ['type', 'playerId', 'role', 'at']) &&
        isMember(value.playerId, playerIds) &&
        ROLE_IDS.has(value.role)
      );
    case 'exchange_resolved':
      return hasOnlyKeys(value, ['type', 'playerId', 'at']) && isMember(value.playerId, playerIds);
    default:
      return false;
  }
}

function preservesViewerSecrets(view, viewerId) {
  for (const player of view.players) {
    for (const [index, card] of player.cards.entries()) {
      if (player.id === viewerId) {
        if (!ROLE_IDS.has(card.role)) return false;
      } else if (!card.revealed && (card.role !== null || card.id !== `hidden-${player.id}-${index}`)) {
        return false;
      }
    }
  }
  if (view.deck.some((card, index) => card.role !== null || card.revealed || card.id !== `deck-${index}`)) return false;
  if (view.exchangeOptions.length && view.pending?.actorId !== viewerId) return false;
  return view.exchangeOptions.every((card) => ROLE_IDS.has(card.role));
}

export function isGameView(value, { viewerId, expectedGameId, expectedPlayerIds } = {}) {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'gameId',
      'version',
      'status',
      'phase',
      'players',
      'deck',
      'currentPlayerId',
      'turn',
      'pending',
      'responseQueue',
      'exchangeOptions',
      'winnerId',
      'finishReason',
      'stopWhenHumansEliminated',
      'log',
      'clockRemaining',
      'clockTotal',
    ]) ||
    !isUuid(value.gameId) ||
    (expectedGameId && value.gameId !== expectedGameId) ||
    !isSafeInteger(value.version, 1) ||
    !['playing', 'finished'].includes(value.status) ||
    !PHASES.has(value.phase) ||
    (value.status === 'playing' && value.phase === 'finished') ||
    !Array.isArray(value.players) ||
    value.players.length < 2 ||
    value.players.length > 6 ||
    !value.players.every(isPlayer)
  )
    return false;

  const playerIds = new Set(value.players.map((player) => player.id));
  if (playerIds.size !== value.players.length || !isMember(viewerId, playerIds)) return false;
  if (
    expectedPlayerIds &&
    (expectedPlayerIds.length !== playerIds.size || expectedPlayerIds.some((id) => !playerIds.has(id)))
  )
    return false;
  if (!isMember(value.currentPlayerId, playerIds) || !isSafeInteger(value.turn, 1)) return false;
  if (!optionalMember(value.winnerId, playerIds)) return false;
  if (!(value.finishReason === null || ['last_survivor', 'humans_eliminated'].includes(value.finishReason)))
    return false;
  if (value.status === 'playing' && (value.winnerId !== null || value.finishReason !== null)) return false;
  if (typeof value.stopWhenHumansEliminated !== 'boolean') return false;
  if (
    !Array.isArray(value.deck) ||
    value.deck.length > 15 ||
    !value.deck.every(isCard) ||
    new Set(value.deck.map((card) => card.id)).size !== value.deck.length
  )
    return false;
  if (!Array.isArray(value.exchangeOptions) || value.exchangeOptions.length > 4 || !value.exchangeOptions.every(isCard))
    return false;
  if (
    !Array.isArray(value.responseQueue) ||
    value.responseQueue.length > 5 ||
    value.responseQueue.some((id) => !isMember(id, playerIds)) ||
    new Set(value.responseQueue).size !== value.responseQueue.length
  )
    return false;
  if (!Array.isArray(value.log) || value.log.length < 1 || value.log.length > 100) return false;
  if (!value.log.every((entry) => isLogEntry(entry, playerIds))) return false;
  if (
    value.clockRemaining !== undefined &&
    (!Number.isFinite(value.clockRemaining) || value.clockRemaining < -60_000 || value.clockRemaining > 120_000)
  )
    return false;
  if (value.clockTotal !== undefined && !isSafeInteger(value.clockTotal, 1, 120_000)) return false;

  if (value.status === 'finished') {
    if (
      value.phase !== 'finished' ||
      value.pending !== null ||
      value.responseQueue.length ||
      value.exchangeOptions.length
    )
      return false;
    if (value.finishReason === 'last_survivor' && !isMember(value.winnerId, playerIds)) return false;
    if (value.finishReason === 'humans_eliminated' && value.winnerId !== null) return false;
  } else if (value.phase === 'turn') {
    if (value.pending !== null || value.responseQueue.length || value.exchangeOptions.length) return false;
  } else {
    if (!isPending(value.pending, playerIds)) return false;
    if (['challenge_action', 'block', 'challenge_block'].includes(value.phase) && !value.responseQueue.length)
      return false;
    if (value.phase === 'challenge_block' && !value.pending.block) return false;
    if (value.phase === 'choose_influence' && (!value.pending.lossPlayerId || !value.pending.afterLoss)) return false;
    if (
      value.phase === 'exchange' &&
      (!value.pending.exchangeCount || value.exchangeOptions.length !== value.pending.exchangeCount + 2)
    )
      return false;
  }

  return preservesViewerSecrets(value, viewerId);
}

export function isGameCommand(value, { playerIds = [] } = {}) {
  if (!isRecord(value) || !isUuid(value.actorId) || (playerIds.length && !playerIds.includes(value.actorId)))
    return false;
  if (value.type === 'declare_action') {
    if (!hasOnlyKeys(value, ['type', 'actorId', 'action', 'targetId']) || !ACTION_IDS.has(value.action)) return false;
    if (!ACTIONS[value.action].targeted) return value.targetId === undefined;
    return (
      isUuid(value.targetId) &&
      value.targetId !== value.actorId &&
      (!playerIds.length || playerIds.includes(value.targetId))
    );
  }
  if (value.type === 'pass' || value.type === 'challenge') return hasOnlyKeys(value, ['type', 'actorId']);
  if (value.type === 'block') return hasOnlyKeys(value, ['type', 'actorId', 'role']) && ROLE_IDS.has(value.role);
  if (value.type === 'reveal_influence') return hasOnlyKeys(value, ['type', 'actorId', 'cardId']) && isId(value.cardId);
  if (value.type === 'choose_exchange')
    return (
      hasOnlyKeys(value, ['type', 'actorId', 'cardIds']) &&
      Array.isArray(value.cardIds) &&
      value.cardIds.length >= 1 &&
      value.cardIds.length <= 2 &&
      value.cardIds.every(isId) &&
      new Set(value.cardIds).size === value.cardIds.length
    );
  return false;
}

export const isCommandEnvelope = (value, options) =>
  isRecord(value) &&
  hasOnlyKeys(value, [
    'id',
    'requestId',
    'gameId',
    'baseVersion',
    'playerId',
    'command',
    'senderId',
    'senderConnectionId',
  ]) &&
  (value.id === undefined || isUuid(value.id)) &&
  (value.requestId === undefined || isUuid(value.requestId)) &&
  (value.gameId === undefined || isUuid(value.gameId)) &&
  (value.baseVersion === undefined || isSafeInteger(value.baseVersion, 1)) &&
  ((value.requestId === undefined && value.gameId === undefined && value.baseVersion === undefined) ||
    (isUuid(value.requestId) && isUuid(value.gameId) && isSafeInteger(value.baseVersion, 1))) &&
  isUuid(value.playerId) &&
  value.senderId === value.playerId &&
  isUuid(value.senderConnectionId) &&
  value.command?.actorId === value.playerId &&
  isGameCommand(value.command, options);
