import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMMAND_RECEIPT_LIMIT,
  COMMAND_RETRY_MS,
  COMMAND_TIMEOUT_MS,
  pendingCommandAction,
  rememberCommandReceipt,
} from '../src/rooms/reliable-command.js';

const pending = {
  requestId: 'request',
  hostId: 'host',
  gameId: 'game',
  baseVersion: 7,
  createdAt: 1_000,
  lastSentAt: 0,
};
const current = { hostId: 'host', gameId: 'game', version: 7, connection: 'connected' };

test('repete uma jogada perdida sem fazer polling enquanto aguarda o ACK', () => {
  assert.equal(pendingCommandAction(pending, { ...current, now: 1_000 }), 'send');
  const sent = { ...pending, lastSentAt: 1_000 };
  assert.equal(pendingCommandAction(sent, { ...current, now: 1_000 + COMMAND_RETRY_MS - 1 }), 'wait');
  assert.equal(pendingCommandAction(sent, { ...current, now: 1_000 + COMMAND_RETRY_MS }), 'send');
  assert.equal(pendingCommandAction(sent, { ...current, connection: 'reconnecting', now: 2_000 }), 'wait');
});

test('estado autoritativo confirma implicitamente e mudanças tornam o pedido obsoleto', () => {
  assert.equal(pendingCommandAction(pending, { ...current, version: 8, now: 1_100 }), 'confirmed');
  assert.equal(pendingCommandAction(pending, { ...current, gameId: 'rematch', now: 1_100 }), 'stale');
  assert.equal(pendingCommandAction(pending, { ...current, hostId: 'successor', now: 1_100 }), 'stale');
  assert.equal(pendingCommandAction(pending, { ...current, now: 1_000 + COMMAND_TIMEOUT_MS }), 'timeout');
});

test('recibos deduplicam pedidos e têm memória limitada', () => {
  const receipts = new Map();
  rememberCommandReceipt(receipts, 'same', { version: 8 });
  rememberCommandReceipt(receipts, 'same', { version: 9 });
  assert.deepEqual([...receipts], [['same', { version: 9 }]]);

  for (let index = 0; index <= COMMAND_RECEIPT_LIMIT; index += 1) {
    rememberCommandReceipt(receipts, `request-${index}`, { version: index });
  }
  assert.equal(receipts.size, COMMAND_RECEIPT_LIMIT);
  assert.equal(receipts.has('same'), false);
  assert.equal(receipts.has('request-0'), false);
  assert.equal(receipts.has(`request-${COMMAND_RECEIPT_LIMIT}`), true);
});

test('perda do comando e do primeiro ACK ainda aplica a decisão exatamente uma vez', () => {
  const receipts = new Map();
  let applications = 0;
  const hostReceives = () => {
    const cached = receipts.get(pending.requestId);
    if (cached) return cached;
    applications += 1;
    return rememberCommandReceipt(receipts, pending.requestId, { accepted: true, version: 8 });
  };

  // Primeira emissão perdida antes do host; a segunda chega, mas o ACK se perde.
  const firstRetry = { ...pending, lastSentAt: pending.createdAt };
  assert.equal(pendingCommandAction(firstRetry, { ...current, now: pending.createdAt + COMMAND_RETRY_MS }), 'send');
  hostReceives();

  // O mesmo requestId chega outra vez: o host devolve o recibo, sem reaplicar.
  const secondRetry = { ...pending, lastSentAt: pending.createdAt + COMMAND_RETRY_MS };
  assert.equal(
    pendingCommandAction(secondRetry, { ...current, now: pending.createdAt + 2 * COMMAND_RETRY_MS }),
    'send',
  );
  assert.deepEqual(hostReceives(), { accepted: true, version: 8 });
  assert.equal(applications, 1);
});
