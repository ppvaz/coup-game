export const JOIN_RETRY_MS = 1_500;
export const JOIN_TIMEOUT_MS = 7_000;

export const hasRoomSeat = (room, playerId) => Boolean(playerId && room?.seats?.some((seat) => seat.id === playerId));

// Pedido de cadeira do convidado: reenvia até o anfitrião responder e desiste
// com feedback após o prazo. Independe do render — uma falha de UI não pode
// impedir o join_request nem silenciar o timeout.
export function startJoinAttempt({
  send,
  isActive,
  hasSeat,
  onTimeout,
  retryMs = JOIN_RETRY_MS,
  timeoutMs = JOIN_TIMEOUT_MS,
}) {
  const tick = () => {
    if (!isActive() || hasSeat()) return;
    send();
    setTimeout(tick, retryMs);
  };
  tick();
  setTimeout(() => {
    if (isActive() && !hasSeat()) onTimeout();
  }, timeoutMs);
}

export function canAcceptRoomSnapshot(room, { code, playerId, isHost = false }) {
  if (!room?.code || room.code !== code) return false;
  return isHost || hasRoomSeat(room, playerId);
}
