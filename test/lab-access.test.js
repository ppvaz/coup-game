import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeLabAccess, LAB_ACCESS_STORAGE_KEY } from '../src/lib/lab-access.js';

const makeStorage = (entries = {}) => {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

test('uma chave válida na URL libera o laboratório e é removida do endereço', () => {
  const storage = makeStorage();
  const result = consumeLabAccess({
    href: 'https://corte.test/lab?theme=dark&labKey=convite#mesa',
    secret: 'convite',
    storage,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.cleanPath, '/lab?theme=dark#mesa');
  assert.equal(storage.getItem(LAB_ACCESS_STORAGE_KEY), 'granted');
});

test('uma chave inválida não concede acesso', () => {
  const result = consumeLabAccess({
    href: 'https://corte.test/?labKey=errada',
    secret: 'convite',
    storage: makeStorage(),
  });

  assert.equal(result.allowed, false);
  assert.equal(result.consumed, true);
  assert.equal(result.cleanPath, '/');
});

test('a permissão persiste em acessos seguintes sem parâmetro', () => {
  const result = consumeLabAccess({
    href: 'https://corte.test/lab',
    secret: 'convite',
    storage: makeStorage({ [LAB_ACCESS_STORAGE_KEY]: 'granted' }),
  });

  assert.equal(result.allowed, true);
  assert.equal(result.consumed, false);
});
