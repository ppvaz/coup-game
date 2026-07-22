export const COMMAND_RETRY_MS = 750;
export const COMMAND_TIMEOUT_MS = 10_000;
export const COMMAND_RECEIPT_LIMIT = 128;

export function pendingCommandAction(pending, { hostId, gameId, version, connection = 'connected', now = Date.now() }) {
  if (!pending) return 'none';
  if (gameId !== pending.gameId) return 'stale';
  if (version > pending.baseVersion) return 'confirmed';
  if (hostId !== pending.hostId) return 'stale';
  if (now - pending.createdAt >= COMMAND_TIMEOUT_MS) return 'timeout';
  if (connection !== 'connected') return 'wait';
  if (!pending.lastSentAt || now - pending.lastSentAt >= COMMAND_RETRY_MS) return 'send';
  return 'wait';
}

export function rememberCommandReceipt(receipts, key, receipt, limit = COMMAND_RECEIPT_LIMIT) {
  if (receipts.has(key)) receipts.delete(key);
  receipts.set(key, receipt);
  while (receipts.size > limit) receipts.delete(receipts.keys().next().value);
  return receipt;
}
