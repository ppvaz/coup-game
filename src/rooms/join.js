export const JOIN_RETRY_MS = 1_500;
export const JOIN_TIMEOUT_MS = 7_000;

export const hasRoomSeat = (room, playerId) => Boolean(playerId && room?.seats?.some((seat) => seat.id === playerId));

export function canAcceptRoomSnapshot(room, { code, playerId, isHost = false }) {
  if (!room?.code || room.code !== code) return false;
  return isHost || hasRoomSeat(room, playerId);
}
