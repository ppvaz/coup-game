import test from 'node:test';
import assert from 'node:assert/strict';
import { createSubscriptionHandler } from '../src/rooms/connection.js';

function subscriptionHarness({ kind = 'join', current = true, hasRoom = false, presenceStatus = 'ok' } = {}) {
  const calls = [];
  const effects = Object.fromEntries(
    [
      'markReconnecting',
      'failConnection',
      'markSubscribed',
      'presenceFailed',
      'reclaimSeat',
      'openCreatedRoom',
      'resumeSeat',
      'beginJoin',
    ].map((name) => [name, () => calls.push(name)]),
  );
  const handler = createSubscriptionHandler({
    kind,
    isCurrent: () => current,
    hasRoom: () => hasRoom,
    track: async () => presenceStatus,
    effects,
  });
  return {
    calls,
    handler,
    setCurrent(value) {
      current = value;
    },
  };
}

test('trata a queda do canal conforme o jogador ainda tenha uma sala', async () => {
  const joining = subscriptionHarness();
  await joining.handler('CHANNEL_ERROR');
  assert.deepEqual(joining.calls, ['failConnection']);

  const reconnecting = subscriptionHarness({ hasRoom: true });
  await reconnecting.handler('TIMED_OUT');
  assert.deepEqual(reconnecting.calls, ['markReconnecting']);
});

test('abre o fluxo correto da primeira assinatura depois de registrar a presença', async () => {
  for (const [kind, expected] of [
    ['create', 'openCreatedRoom'],
    ['resume', 'resumeSeat'],
    ['join', 'beginJoin'],
  ]) {
    const subscription = subscriptionHarness({ kind });
    await subscription.handler('SUBSCRIBED');
    assert.deepEqual(subscription.calls, ['markSubscribed', expected]);
  }
});

test('retoma a cadeira existente quando o canal assina novamente', async () => {
  const subscription = subscriptionHarness({ kind: 'create' });
  await subscription.handler('SUBSCRIBED');
  await subscription.handler('SUBSCRIBED');
  assert.deepEqual(subscription.calls, ['markSubscribed', 'openCreatedRoom', 'markSubscribed', 'reclaimSeat']);
});

test('interrompe o fluxo quando o registro de presença falha', async () => {
  const subscription = subscriptionHarness({ presenceStatus: 'error' });
  await subscription.handler('SUBSCRIBED');
  assert.deepEqual(subscription.calls, ['markSubscribed', 'presenceFailed']);
});

test('ignora canais obsoletos antes e depois de registrar a presença', async () => {
  const staleBeforeTrack = subscriptionHarness({ current: false });
  await staleBeforeTrack.handler('SUBSCRIBED');
  assert.deepEqual(staleBeforeTrack.calls, []);

  let releasePresence;
  const calls = [];
  let current = true;
  const handler = createSubscriptionHandler({
    kind: 'join',
    isCurrent: () => current,
    hasRoom: () => false,
    track: () => new Promise((resolve) => (releasePresence = resolve)),
    effects: {
      markSubscribed: () => calls.push('markSubscribed'),
      beginJoin: () => calls.push('beginJoin'),
    },
  });
  const subscribing = handler('SUBSCRIBED');
  current = false;
  releasePresence('ok');
  await subscribing;
  assert.deepEqual(calls, ['markSubscribed']);
});
