import { ACTIONS, isAlive, validActionTargets } from '../../game/coup.js';
import { projectTabletopDecision } from './coup-intents.js';

const FULL_TURN = Math.PI * 2;

const PHASE_BEATS = {
  turn: 'turn',
  challenge_action: 'claim',
  block: 'block-window',
  challenge_block: 'block-claim',
  choose_influence: 'influence-loss',
  exchange: 'exchange',
  finished: 'victory',
};

const playerSummary = (player) => (player ? Object.freeze({ id: player.id, name: player.name }) : null);

export function projectCoinMovements(game) {
  const gameId = game?.gameId ?? 'local';
  return Object.freeze(
    (game?.log ?? [])
      .flatMap((event) => {
        const action = ACTIONS[event.action];
        if (event.type === 'action_declared' && action?.cost) {
          return [
            Object.freeze({
              id: `${gameId}:${event.at}:cost:${event.actorId}:${event.action}`,
              fromId: event.actorId,
              toId: null,
              amount: action.cost,
              reason: 'cost',
            }),
          ];
        }
        if (event.type === 'action_resolved' && event.action === 'steal') {
          const amount = Math.max(1, Math.min(2, Number(event.amount) || 2));
          return [
            Object.freeze({
              id: `${gameId}:${event.at}:steal:${event.actorId}:${event.targetId}`,
              fromId: event.targetId,
              toId: event.actorId,
              amount,
              reason: 'steal',
            }),
          ];
        }
        if (event.type === 'action_resolved' && action?.coins) {
          return [
            Object.freeze({
              id: `${gameId}:${event.at}:gain:${event.actorId}:${event.action}`,
              fromId: null,
              toId: event.actorId,
              amount: action.coins,
              reason: 'gain',
            }),
          ];
        }
        if (event.type === 'challenge_resolved' && Number(event.refundedCost) > 0) {
          return [
            Object.freeze({
              id: `${gameId}:${event.at}:refund:${event.challengedId}`,
              fromId: null,
              toId: event.challengedId,
              amount: Math.min(7, Math.floor(event.refundedCost)),
              reason: 'refund',
            }),
          ];
        }
        return [];
      })
      .slice(-24),
  );
}

export function projectTabletopEvents(game) {
  const gameId = game?.gameId ?? 'local';
  const log = game?.log ?? [];
  const firstIndex = Math.max(0, log.length - 24);
  return Object.freeze(
    log.slice(firstIndex).map((event) => {
      const at = Math.max(0, Number(event.at) || 0);
      const actorId = event.actorId ?? event.playerId ?? null;
      return Object.freeze({
        id: `${gameId}:${at}:${event.type}:${actorId ?? ''}:${event.targetId ?? ''}:${event.challengerId ?? ''}:${event.challengedId ?? ''}`,
        type: event.type,
        actorId,
        targetId: event.targetId ?? null,
        challengerId: event.challengerId ?? null,
        challengedId: event.challengedId ?? null,
        winnerId: event.winnerId ?? null,
        loserId: event.loserId ?? null,
        truthful: typeof event.truthful === 'boolean' ? event.truthful : null,
      });
    }),
  );
}

/**
 * Barreira de dados entre Coup e o palco. Aceita até o estado completo do
 * host, mas remove papéis ocultos dos rivais antes de chegar ao WebGL.
 */
export function projectCoupTableView(
  game,
  myId,
  { exchangePicks = [], targetAction = null, selectedTargetId = null } = {},
) {
  if (!game) throw new Error('A mesa 3D precisa de uma partida.');
  // A geografia da sala é pública e compartilhada. O jogador local pode estar
  // em qualquer cadeira; as câmeras procuram `isSelf` sem girar os demais
  // assentos ou trocar porta e janelas de lugar entre clientes.
  const ordered = game.players.slice(0, 6);
  const players = new Map(game.players.map((player) => [player.id, player]));
  const pending = game.pending ?? {};
  const actor = players.get(pending.actorId) ?? null;
  const target = players.get(pending.targetId) ?? null;
  const blocker = players.get(pending.block?.playerId) ?? null;
  const loser = players.get(pending.lossPlayerId) ?? null;
  const action = pending.action ? ACTIONS[pending.action] : null;
  const phase = game.status === 'finished' ? 'finished' : game.phase;
  const selfChoosesInfluence = phase === 'choose_influence' && pending.lossPlayerId === myId;
  const selfExchanges = phase === 'exchange' && pending.actorId === myId;
  const selectedExchangeIds = new Set(exchangePicks);
  const targetableIds = new Set(validActionTargets(game, myId, targetAction).map((player) => player.id));
  const targetingAction = targetableIds.size ? ACTIONS[targetAction] : null;
  const selectedTarget = targetableIds.has(selectedTargetId) ? selectedTargetId : null;
  const decision = projectTabletopDecision(game, myId, { targeting: Boolean(targetingAction) });

  const seats = ordered.map((player, index) => {
    const self = player.id === myId;
    return Object.freeze({
      id: player.id,
      name: player.name,
      index,
      azimuthRad: (FULL_TURN * index) / ordered.length,
      isSelf: self,
      isCurrent: player.id === game.currentPlayerId,
      isActor: player.id === pending.actorId,
      isTarget: player.id === pending.targetId,
      isBlocker: player.id === pending.block?.playerId,
      isWinner: phase === 'finished' && player.id === game.winnerId,
      isSelectableTarget: targetableIds.has(player.id),
      isSelectedTarget: player.id === selectedTarget,
      connected: player.connected !== false,
      eliminated: !isAlive(player),
      coins: Math.max(0, Number(player.coins) || 0),
      influences: Object.freeze(
        player.cards.map((card, cardIndex) =>
          Object.freeze({
            id: self ? card.id : `seat:${index}:influence:${cardIndex}`,
            revealed: Boolean(card.revealed),
            role: self || card.revealed ? card.role : null,
            selectable: Boolean(self && selfChoosesInfluence && !card.revealed),
            focusable: self,
          }),
        ),
      ),
    });
  });

  const latest = game.log?.at(-1) ?? null;
  const latestInfluenceLoss = game.log?.findLast((event) => event.type === 'influence_lost') ?? null;
  return Object.freeze({
    id: `${game.gameId ?? 'local'}:${game.version ?? 0}`,
    phase,
    beat: PHASE_BEATS[phase] ?? 'turn',
    turn: Math.max(1, Number(game.turn) || 1),
    selfId: myId,
    currentPlayer: playerSummary(players.get(game.currentPlayerId)),
    winner: playerSummary(players.get(game.winnerId)),
    action: action
      ? Object.freeze({
          id: pending.action,
          label: action.label,
          claimedRole: pending.claimedRole ?? null,
          actor: playerSummary(actor),
          target: playerSummary(target),
        })
      : null,
    block: pending.block ? Object.freeze({ role: pending.block.role, player: playerSummary(blocker) }) : null,
    influenceLoser: playerSummary(loser),
    latestInfluenceLoss: latestInfluenceLoss
      ? Object.freeze({
          player: playerSummary(players.get(latestInfluenceLoss.playerId)),
          role: latestInfluenceLoss.role ?? null,
          at: Math.max(0, Number(latestInfluenceLoss.at) || 0),
        })
      : null,
    responsePlayer: playerSummary(players.get(game.responseQueue?.[0])),
    decision,
    coinMovements: projectCoinMovements(game),
    stageEvents: projectTabletopEvents(game),
    targeting: targetingAction
      ? Object.freeze({
          id: targetAction,
          label: targetingAction.label,
          targetIds: Object.freeze([...targetableIds]),
          selectedTargetId: selectedTarget,
        })
      : null,
    latestEvent: latest
      ? Object.freeze({
          type: latest.type,
          truthful: typeof latest.truthful === 'boolean' ? latest.truthful : null,
          role: latest.role ?? latest.claimedRole ?? null,
        })
      : null,
    exchange: selfExchanges
      ? Object.freeze({
          requiredCount: Math.max(1, Number(pending.exchangeCount) || 1),
          options: Object.freeze(
            game.exchangeOptions.map((card) =>
              Object.freeze({
                id: card.id,
                role: card.role,
                selected: selectedExchangeIds.has(card.id),
              }),
            ),
          ),
        })
      : null,
    seats: Object.freeze(seats),
  });
}
