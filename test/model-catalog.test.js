import test from 'node:test';
import assert from 'node:assert/strict';
import { COURT_MODELS } from '../src/lib/tabletop/model-catalog.js';
import { TABLETOP_THROWABLES } from '../src/lib/tabletop/reactions.js';

// A mecânica de busca, padrão e endereço é do registro compartilhado e está
// coberta em `model-registry.test.js`. Aqui só o acervo de La Corte.

test('o catálogo é metadado puro e não arrasta as fábricas para o teste', () => {
  // A construção é `import()` tardio de propósito: metade das fábricas importa
  // texturas .webp, que só um bundler resolve. Se alguma virar import estático,
  // este arquivo deixa de carregar.
  assert.ok(COURT_MODELS.models.length >= 8);
  for (const model of COURT_MODELS.models) {
    assert.ok(model.hint, `${model.id} precisa de descrição`);
  }
});

test('os arremessos vêm da lista autoritativa, não de uma cópia', () => {
  const item = COURT_MODELS.find('arremesso').params.find((param) => param.id === 'item');
  assert.deepEqual(
    item.values.map((option) => option.value),
    TABLETOP_THROWABLES.map((throwable) => throwable.id),
  );
});

test('a carta expõe os quatro estados, e o padrão é o da própria mão', () => {
  // O estado que mais importa inspecionar é o que só o dono da carta vê: retrato
  // colorido, sem sigilo. Ele já ficou inalcançável uma vez, por o catálogo
  // oferecer apenas "oculta" e "revelada".
  const estado = COURT_MODELS.find('influencia').params.find((param) => param.id === 'estado');
  assert.deepEqual(
    estado.values.map((option) => option.value),
    ['propria', 'selecionavel', 'sigilo', 'perdida'],
  );
  assert.equal(COURT_MODELS.fromSearch('?modelo=influencia').options.estado, 'propria');
});

test('toda peça do acervo reabre pelo próprio endereço', () => {
  for (const model of COURT_MODELS.models) {
    const options = Object.fromEntries(model.params.map((param) => [param.id, param.values.at(-1).value]));
    const reopened = COURT_MODELS.fromSearch(`?${COURT_MODELS.toSearch(model, options)}`);
    assert.equal(reopened.model.id, model.id);
    assert.deepEqual(reopened.options, options);
  }
});
