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
    activeGameId: null,
    activePlayerIds: [],
    hostId,
    maxPlayers,
    seats: [{ id: hostId, name: hostName, kind: 'human', connected: true, joinedAt: Date.now() }],
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

export function nextGameSeats(room) {
  return room.seats.filter((seat) => seat.connected);
}

export function roomClosure(room, now = Date.now(), graceMs = HOST_GRACE_MS) {
  const humans = room.seats.filter((seat) => seat.kind === 'human');
  const connected = humans.filter((seat) => seat.connected);
  const disconnected = humans.filter((seat) => !seat.connected && Number.isFinite(seat.disconnectedAt));
  if (connected.length !== 1 || !disconnected.length) {
    return { status: 'stable', survivorId: connected[0]?.id ?? null, remainingMs: 0 };
  }

  const remainingMs = Math.max(0, ...disconnected.map((seat) => seat.disconnectedAt + graceMs - now));
  return {
    status: remainingMs > 0 ? 'waiting' : 'ready',
    survivorId: connected[0].id,
    remainingMs,
  };
}

export function hostElection(room, now = Date.now(), graceMs = HOST_GRACE_MS) {
  const host = room.seats.find((candidate) => candidate.id === room.hostId);
  if (host?.connected) return { status: 'stable', candidateId: null, remainingMs: 0 };

  const activeIds = room.status === 'playing' && room.activePlayerIds?.length ? new Set(room.activePlayerIds) : null;
  const successor = room.seats
    .filter(
      (candidate) => candidate.kind === 'human' && candidate.connected && (!activeIds || activeIds.has(candidate.id)),
    )
    .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id))[0];
  if (!successor) return { status: 'unavailable', candidateId: null, remainingMs: Infinity };

  const remainingMs = Math.max(0, (host?.disconnectedAt ?? now) + graceMs - now);
  return {
    status: remainingMs > 0 ? 'waiting' : 'ready',
    candidateId: successor.id,
    remainingMs,
  };
}

// Decide a reação à situação da mesa após uma sincronização de presença:
// encerrar, aguardar carência (com prazo de reavaliação), promover um novo
// anfitrião ou seguir estável. Pura — quem chama executa os efeitos.
export function continuityPlan(room, { myId, handoverActive = false, now = Date.now(), graceMs = HOST_GRACE_MS } = {}) {
  const closure = roomClosure(room, now, graceMs);
  if (closure.status === 'waiting')
    return { action: 'wait', hostIssue: { status: 'closing' }, recheckMs: closure.remainingMs + 30 };
  if (closure.status === 'ready') return { action: 'close', hostIssue: { status: 'closing' } };

  if (handoverActive) return { action: 'idle', hostIssue: { status: 'promoting' } };

  const election = hostElection(room, now, graceMs);
  if (election.status === 'stable') return { action: 'idle', hostIssue: null };

  const candidate = room.seats.find((seat) => seat.id === election.candidateId);
  const hostIssue = {
    status: election.status,
    candidateId: election.candidateId,
    candidateName: candidate?.name ?? 'outro jogador',
  };
  if (election.status === 'waiting') return { action: 'wait', hostIssue, recheckMs: election.remainingMs + 30 };
  if (election.status === 'ready' && election.candidateId === myId) return { action: 'promote', hostIssue };
  return { action: 'idle', hostIssue };
}

export function dispatchRoom(source, command) {
  const room = clone(source);
  const isHost = command.actorId === room.hostId;

  switch (command.type) {
    case 'join': {
      if (room.seats.some((candidate) => candidate.id === command.player.id)) return room;
      if (room.seats.length >= room.maxPlayers) throw new Error('A sala está cheia.');
      room.seats.push({
        ...command.player,
        kind: 'human',
        connected: true,
        joinedAt: Date.now(),
        joinsNextGame: room.status !== 'lobby',
      });
      break;
    }
    // A sala nunca carrega o estado da partida: as cartas viajam apenas nas
    // vistas cifradas por jogador. Aqui ficam só os metadados públicos.
    case 'start_game': {
      if (!isHost) throw new Error('Apenas o anfitrião pode iniciar a partida.');
      if (room.status === 'playing') throw new Error('A partida já está em andamento.');
      const playerIds = command.playerIds ?? [];
      if (playerIds.length < 2) throw new Error('São necessários pelo menos dois jogadores.');
      room.status = 'playing';
      room.activeGameId = command.gameId ?? null;
      room.activePlayerIds = [...playerIds];
      room.seats = room.seats.map((candidate) => ({
        ...candidate,
        joinsNextGame: !playerIds.includes(candidate.id),
      }));
      break;
    }
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
