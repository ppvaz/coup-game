import { ACTIONS, isAlive } from '../../game/coup.js';

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

/**
 * Barreira de dados entre Coup e o palco. Aceita até o estado completo do
 * host, mas remove papéis ocultos dos rivais antes de chegar ao WebGL.
 */
export function projectCoupTableView(game, myId) {
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
      connected: player.connected !== false,
      eliminated: !isAlive(player),
      coins: Math.max(0, Number(player.coins) || 0),
      influences: Object.freeze(
        player.cards.map((card, cardIndex) =>
          Object.freeze({
            id: self ? card.id : `seat:${index}:influence:${cardIndex}`,
            revealed: Boolean(card.revealed),
            role: self || card.revealed ? card.role : null,
          }),
        ),
      ),
    });
  });

  const latest = game.log?.at(-1) ?? null;
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
    responsePlayer: playerSummary(players.get(game.responseQueue?.[0])),
    latestEvent: latest
      ? Object.freeze({
          type: latest.type,
          truthful: typeof latest.truthful === 'boolean' ? latest.truthful : null,
          role: latest.role ?? latest.claimedRole ?? null,
        })
      : null,
    seats: Object.freeze(seats),
  });
}
