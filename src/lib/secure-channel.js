const encoder = new TextEncoder();
const decoder = new TextDecoder();

const bytesToBase64 = (bytes) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64ToBytes = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

export async function createEncryptionIdentity(cryptoApi = globalThis.crypto) {
  const keyPair = await cryptoApi.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  return {
    cryptoApi,
    privateKey: keyPair.privateKey,
    publicKey: await cryptoApi.subtle.exportKey('jwk', keyPair.publicKey),
  };
}

async function sharedKey(identity, publicKey, usage) {
  const imported = await identity.cryptoApi.subtle.importKey(
    'jwk',
    publicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  return identity.cryptoApi.subtle.deriveKey(
    { name: 'ECDH', public: imported },
    identity.privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

export async function encryptFor(identity, recipientPublicKey, value) {
  const iv = identity.cryptoApi.getRandomValues(new Uint8Array(12));
  const key = await sharedKey(identity, recipientPublicKey, 'encrypt');
  const encrypted = await identity.cryptoApi.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(value)),
  );
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) };
}

export async function decryptFrom(identity, senderPublicKey, encrypted) {
  const key = await sharedKey(identity, senderPublicKey, 'decrypt');
  const decrypted = await identity.cryptoApi.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(encrypted.iv) },
    key,
    base64ToBytes(encrypted.data),
  );
  return JSON.parse(decoder.decode(decrypted));
}
