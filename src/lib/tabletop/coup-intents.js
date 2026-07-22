import { ACTIONS, isAlive, validActionTargets } from '../../game/coup.js';

export const TABLETOP_ACTION_ORDER = ['income', 'foreign_aid', 'tax', 'steal', 'exchange', 'assassinate', 'coup'];

const ACTION_HINTS = {
  income: '+1 moeda',
  foreign_aid: '+2 moedas',
  tax: 'Duque · +3',
  steal: 'Capitão · alvo',
  exchange: 'Embaixadora',
  assassinate: '3 moedas · alvo',
  coup: '7 moedas · alvo',
};

const option = (id, label, kicker, { enabled = true, tone = 'gold' } = {}) =>
  Object.freeze({ id, label, kicker, enabled, tone });

const actionEnabled = (game, actor, actionId) => {
  const action = ACTIONS[actionId];
  if (!action || !actor || !isAlive(actor)) return false;
  if (actor.coins >= 10 && actionId !== 'coup') return false;
  if ((action.cost ?? 0) > actor.coins) return false;
  return !action.targeted || validActionTargets(game, actor.id, actionId).length > 0;
};

/**
 * Projeta somente as escolhas públicas que pertencem ao jogador local. A
 * autoridade continua em dispatchGame; esta estrutura apenas alimenta as
 * duas apresentações (objetos 3D e fallback HTML).
 */
export function projectTabletopDecision(game, myId, { targeting = false } = {}) {
  if (!game || game.status !== 'playing' || targeting) return null;
  const actor = game.players.find((player) => player.id === myId);
  if (!actor || !isAlive(actor)) return null;

  if (game.phase === 'turn' && game.currentPlayerId === myId) {
    return Object.freeze({
      key: `${game.gameId ?? 'local'}:${game.turn}:action`,
      kind: 'action',
      title: 'Escolha uma ação',
      options: Object.freeze(
        TABLETOP_ACTION_ORDER.map((actionId) => {
          const action = ACTIONS[actionId];
          return option(`action:${actionId}`, action.label, ACTION_HINTS[actionId], {
            enabled: actionEnabled(game, actor, actionId),
            tone: action.role || actionId === 'coup' ? 'danger' : 'gold',
          });
        }),
      ),
    });
  }

  if (game.responseQueue?.[0] !== myId) return null;
  if (game.phase === 'challenge_action') {
    return Object.freeze({
      key: `${game.gameId ?? 'local'}:${game.turn}:challenge-action:${game.pending.actorId}`,
      kind: 'response',
      title: `Responder à alegação de ${game.pending.claimedRole}`,
      options: Object.freeze([
        option('response:challenge', 'Contestar', 'Exigir a prova', { tone: 'danger' }),
        option('response:pass', 'Permitir', 'Aceitar a ação'),
      ]),
    });
  }

  if (game.phase === 'block') {
    const roles = ACTIONS[game.pending.action]?.blockedBy ?? [];
    return Object.freeze({
      key: `${game.gameId ?? 'local'}:${game.turn}:block:${game.pending.action}:${myId}`,
      kind: 'block',
      title: 'Bloquear ou permitir',
      options: Object.freeze([
        ...roles.map((role) => option(`block:${role}`, role, 'Declarar bloqueio', { tone: 'danger' })),
        option('response:pass', 'Permitir', 'Não bloquear'),
      ]),
    });
  }

  if (game.phase === 'challenge_block') {
    return Object.freeze({
      key: `${game.gameId ?? 'local'}:${game.turn}:challenge-block:${game.pending.block.playerId}`,
      kind: 'response',
      title: `Responder ao bloqueio de ${game.pending.block.role}`,
      options: Object.freeze([
        option('response:challenge', 'Contestar', 'Exigir a prova', { tone: 'danger' }),
        option('response:pass', 'Aceitar', 'Encerrar a ação'),
      ]),
    });
  }

  return null;
}

/** Converte uma intenção do palco no mesmo comando aceito pelo motor. */
export function tabletopIntentOutcome(game, myId, intentId) {
  const decision = projectTabletopDecision(game, myId);
  const selected = decision?.options.find((candidate) => candidate.id === intentId && candidate.enabled);
  if (!selected) return null;

  const [kind, value] = selected.id.split(':');
  if (kind === 'action') {
    if (ACTIONS[value]?.targeted) return Object.freeze({ kind: 'target', actionId: value });
    return Object.freeze({
      kind: 'command',
      command: Object.freeze({ type: 'declare_action', actorId: myId, action: value }),
    });
  }
  if (kind === 'block') {
    return Object.freeze({
      kind: 'command',
      command: Object.freeze({ type: 'block', actorId: myId, role: value }),
    });
  }
  if (kind === 'response') {
    return Object.freeze({
      kind: 'command',
      command: Object.freeze({ type: value === 'challenge' ? 'challenge' : 'pass', actorId: myId }),
    });
  }
  return null;
}

/** Dois toques confirmam; trocar de efígie apenas rearma a escolha. */
export function nextTabletopIntentConfirmation(armedIntentId, pickedIntentId) {
  if (!pickedIntentId) return Object.freeze({ kind: 'cancel', intentId: null });
  if (pickedIntentId === armedIntentId) return Object.freeze({ kind: 'confirm', intentId: pickedIntentId });
  return Object.freeze({ kind: 'arm', intentId: pickedIntentId });
}
