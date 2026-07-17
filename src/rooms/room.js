const clone = (value) => structuredClone(value);

export const HOST_GRACE_MS = 8_000;

export function generateRoomCode(random = Math.random) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 5 }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
}

export function createRoom({ code = generateRoomCode(), hostId, hostName, maxPlayers = 6 }) {
  return {
    version: 1,
    code,
    status: 'lobby',
    hostId,
    maxPlayers,
    seats: [{ id: hostId, name: hostName, kind: 'human', connected: true, joinedAt: Date.now() }],
    pending: [],
    game: null,
    updatedAt: Date.now(),
  };
}

export function syncRoomPresence(source, connectedIds, now = Date.now()) {
  const room = clone(source);
  const connected = new Set(connectedIds);
  let changed = false;

  for (const seat of room.seats.filter((candidate) => candidate.kind === 'human')) {
    const isConnected = connected.has(seat.id);
    if (seat.connected === isConnected) continue;
    seat.connected = isConnected;
    changed = true;
    if (isConnected) delete seat.disconnectedAt;
    else seat.disconnectedAt = now;
  }

  if (changed) {
    room.version += 1;
    room.updatedAt = now;
  }
  return room;
}

export function hostElection(room, now = Date.now(), graceMs = HOST_GRACE_MS) {
  const host = room.seats.find((candidate) => candidate.id === room.hostId);
  if (host?.connected) return { status: 'stable', candidateId: null, remainingMs: 0 };

  const successor = room.seats
    .filter((candidate) => candidate.kind === 'human' && candidate.connected)
    .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))[0];
  if (!successor) return { status: 'unavailable', candidateId: null, remainingMs: Infinity };

  const remainingMs = Math.max(0, (host?.disconnectedAt ?? now) + graceMs - now);
  return {
    status: remainingMs > 0 ? 'waiting' : 'ready',
    candidateId: successor.id,
    remainingMs,
  };
}

export function dispatchRoom(source, command) {
  const room = clone(source);
  const seat = room.seats.find((candidate) => candidate.id === command.actorId);
  const isHost = command.actorId === room.hostId;

  switch (command.type) {
    case 'join': {
      if (room.seats.some((candidate) => candidate.id === command.player.id)) return room;
      if (room.status !== 'lobby') {
        if (!room.pending.some((candidate) => candidate.id === command.player.id)) room.pending.push(command.player);
        break;
      }
      if (room.seats.length >= room.maxPlayers) throw new Error('A sala está cheia.');
      room.seats.push({ ...command.player, kind: 'human', connected: true, joinedAt: Date.now() });
      break;
    }
    case 'approve_join': {
      if (!isHost) throw new Error('Apenas o anfitrião pode aprovar entradas.');
      const player = room.pending.find((candidate) => candidate.id === command.playerId);
      if (!player) throw new Error('Pedido de entrada não encontrado.');
      if (room.seats.length >= room.maxPlayers) throw new Error('A sala está cheia.');
      room.pending = room.pending.filter((candidate) => candidate.id !== command.playerId);
      room.seats.push({
        ...player,
        kind: 'human',
        connected: true,
        joinedAt: Date.now(),
        joinsNextGame: room.status !== 'lobby',
      });
      break;
    }
    case 'reject_join':
      if (!isHost) throw new Error('Apenas o anfitrião pode recusar entradas.');
      room.pending = room.pending.filter((candidate) => candidate.id !== command.playerId);
      break;
    case 'add_bot': {
      if (!isHost || room.status !== 'lobby') throw new Error('Bots só podem ser adicionados pelo anfitrião no lobby.');
      if (room.seats.length >= room.maxPlayers) throw new Error('A sala está cheia.');
      room.seats.push({
        id: command.bot.id,
        name: command.bot.name,
        kind: 'bot',
        connected: true,
        joinedAt: Date.now(),
      });
      break;
    }
    case 'remove_seat':
      if (!isHost && command.actorId !== command.playerId) throw new Error('Sem permissão para remover este jogador.');
      room.seats = room.seats.filter((candidate) => candidate.id !== command.playerId);
      break;
    case 'disconnect':
      if (!seat) return room;
      seat.connected = false;
      seat.disconnectedAt = command.now ?? Date.now();
      break;
    case 'reconnect':
      if (!seat) throw new Error('Assento não encontrado.');
      seat.connected = true;
      delete seat.disconnectedAt;
      break;
    case 'start_game':
      if (!isHost || room.status !== 'lobby') throw new Error('Apenas o anfitrião pode iniciar a partida.');
      if (room.seats.length < 2) throw new Error('São necessários pelo menos dois jogadores.');
      room.status = 'playing';
      room.game = command.game;
      break;
    case 'commit_game':
      if (!isHost || room.status !== 'playing') throw new Error('Somente o host autoritativo pode confirmar o estado.');
      if (command.game.version <= room.game.version) throw new Error('Versão de estado obsoleta.');
      room.game = command.game;
      if (command.game.status === 'finished') room.status = 'finished';
      break;
    case 'transfer_host':
      if (!isHost) throw new Error('Apenas o anfitrião atual pode transferir a mesa.');
      if (!room.seats.some((candidate) => candidate.id === command.playerId && candidate.connected))
        throw new Error('Novo anfitrião inválido.');
      room.hostId = command.playerId;
      break;
    case 'promote_host': {
      const election = hostElection(room, command.now, command.graceMs);
      if (election.status !== 'ready' || election.candidateId !== command.actorId)
        throw new Error('Este jogador ainda não pode assumir como anfitrião.');
      room.hostId = command.actorId;
      break;
    }
    default:
      throw new Error('Comando de sala desconhecido.');
  }

  room.version += 1;
  room.updatedAt = command.now ?? Date.now();
  return room;
}

export function roomView(room, viewerId, redactGame) {
  const view = clone(room);
  view.pending = viewerId === room.hostId ? view.pending : [];
  if (view.game && redactGame) view.game = redactGame(room.game, viewerId);
  return view;
}
