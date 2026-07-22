import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODEL_CATALOG,
  MODEL_CATEGORIES,
  defaultModelOptions,
  findModel,
  modelSearch,
  modelSelectionFromSearch,
} from '../src/lib/tabletop/model-catalog.js';
import { TABLETOP_THROWABLES } from '../src/lib/tabletop/reactions.js';

test('o catálogo é metadado puro e não arrasta as fábricas para o teste', () => {
  // A construção é `import()` tardio de propósito: metade das fábricas importa
  // texturas .webp, que só um bundler resolve. Se alguma virar import estático,
  // este arquivo deixa de carregar.
  assert.ok(MODEL_CATALOG.length >= 8);
  for (const model of MODEL_CATALOG) {
    assert.equal(typeof model.build, 'function');
    assert.ok(model.label && model.hint, `${model.id} precisa de rótulo e descrição`);
    assert.ok(
      MODEL_CATEGORIES.some((category) => category.id === model.category),
      `${model.id} está numa categoria inexistente`,
    );
    for (const param of model.params) {
      assert.ok(param.values.length > 1, `${model.id}/${param.id} com uma opção só não é parâmetro`);
    }
  }
  assert.equal(new Set(MODEL_CATALOG.map((model) => model.id)).size, MODEL_CATALOG.length);
});

test('os arremessos vêm da lista autoritativa, não de uma cópia', () => {
  const item = findModel('arremesso').params.find((param) => param.id === 'item');
  assert.deepEqual(
    item.values.map((option) => option.value),
    TABLETOP_THROWABLES.map((throwable) => throwable.id),
  );
});

test('a carta expõe os quatro estados, e o padrão é o da própria mão', () => {
  // O estado que mais importa inspecionar é o que só o dono da carta vê: retrato
  // colorido, sem sigilo. Ele já ficou inalcançável uma vez, por o catálogo
  // oferecer apenas "oculta" e "revelada".
  const estado = findModel('influencia').params.find((param) => param.id === 'estado');
  assert.deepEqual(
    estado.values.map((option) => option.value),
    ['propria', 'selecionavel', 'sigilo', 'perdida'],
  );
  assert.equal(modelSelectionFromSearch('?modelo=influencia').options.estado, 'propria');
});

test('a URL escolhe modelo e parâmetros, e o inválido cai no padrão', () => {
  const chosen = modelSelectionFromSearch('?modelo=cortesao&manto=3&pele=2');
  assert.equal(chosen.model.id, 'cortesao');
  assert.deepEqual(chosen.options, { manto: '3', pele: '2' });

  // Endereço colado à mão ou captura antiga não pode derrubar a vitrine.
  assert.equal(modelSelectionFromSearch('?modelo=inexistente').model.id, MODEL_CATALOG[0].id);
  assert.deepEqual(modelSelectionFromSearch('?modelo=cortesao&manto=99').options.manto, '0');
  assert.deepEqual(modelSelectionFromSearch('').options, defaultModelOptions(MODEL_CATALOG[0].params));

  // Um parâmetro de outro modelo não vaza para o selecionado.
  assert.deepEqual(modelSelectionFromSearch('?modelo=moeda&manto=3').options, { pose: 'deitada' });
});

test('o endereço reconstruído reabre exatamente a mesma peça', () => {
  for (const model of MODEL_CATALOG) {
    const options = Object.fromEntries(model.params.map((param) => [param.id, param.values.at(-1).value]));
    const reopened = modelSelectionFromSearch(`?${modelSearch(model, options)}`);
    assert.equal(reopened.model.id, model.id);
    assert.deepEqual(reopened.options, options);
  }
});
