import test from 'node:test';
import assert from 'node:assert/strict';
import { createEncryptionIdentity, decryptFrom, encryptFor } from '../src/lib/secure-channel.js';

test('cifra uma visão para uma única identidade', async () => {
  const host = await createEncryptionIdentity();
  const ana = await createEncryptionIdentity();
  const bia = await createEncryptionIdentity();
  const view = { players: [{ id: 'ana', cards: [{ role: 'Duque' }] }], deck: [{ role: null }] };
  const encrypted = await encryptFor(host, ana.publicKey, view);

  assert.deepEqual(await decryptFrom(ana, host.publicKey, encrypted), view);
  await assert.rejects(() => decryptFrom(bia, host.publicKey, encrypted));
  assert.doesNotMatch(encrypted.data, /Duque/);
});
