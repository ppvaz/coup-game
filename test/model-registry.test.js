import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultModelOptions, defineModelCatalog } from '../packages/tabletop-stage/model-registry.js';

const categories = [{ id: 'peca', label: 'Peças' }];
const models = [
  {
    id: 'roda',
    label: 'Roda',
    category: 'peca',
    params: [
      {
        id: 'raio',
        label: 'Raio',
        values: [
          { value: 'p', label: 'Pequeno' },
          { value: 'g', label: 'Grande' },
        ],
      },
    ],
    build: () => ({}),
  },
  { id: 'cubo', label: 'Cubo', category: 'peca', params: [], build: () => ({}) },
];

const catalog = defineModelCatalog({ categories, models });

test('o registro recusa um catálogo que a vitrine não conseguiria desenhar', () => {
  const model = { id: 'x', label: 'X', category: 'peca', build: () => ({}) };
  assert.throws(() => defineModelCatalog({ categories, models: [{ ...model, category: 'nenhuma' }] }), /categoria/u);
  assert.throws(() => defineModelCatalog({ categories, models: [{ ...model, build: null }] }), /fábrica/u);
  assert.throws(() => defineModelCatalog({ categories, models: [model, model] }), /repetido/u);
  // Um botão com uma opção só é constante disfarçada de parâmetro.
  const single = { ...model, params: [{ id: 'p', label: 'P', values: [{ value: 'a', label: 'A' }] }] };
  assert.throws(() => defineModelCatalog({ categories, models: [single] }), /duas opções/u);
});

test('o catálogo publicado é imutável', () => {
  assert.throws(() => catalog.models.push({}), TypeError);
  assert.throws(() => {
    catalog.models[0].label = 'outro';
  }, TypeError);
});

test('um modelo desconhecido cai no primeiro em vez de derrubar a vitrine', () => {
  assert.equal(catalog.find('inexistente').id, 'roda');
  assert.equal(catalog.find(null).id, 'roda');
  assert.equal(catalog.find('cubo').id, 'cubo');
});

test('os padrões são sempre a primeira opção de cada parâmetro', () => {
  assert.deepEqual(catalog.defaults(catalog.find('roda')), { raio: 'p' });
  assert.deepEqual(defaultModelOptions([]), {});
});

test('o endereço sobrevive à ida e à volta, e o valor inválido vira padrão', () => {
  assert.deepEqual(catalog.fromSearch('?modelo=roda&raio=g').options, { raio: 'g' });
  assert.deepEqual(catalog.fromSearch('?modelo=roda&raio=99').options, { raio: 'p' });
  // Parâmetro de outro modelo não vaza para o selecionado.
  assert.deepEqual(catalog.fromSearch('?modelo=cubo&raio=g').options, {});

  const reopened = catalog.fromSearch(`?${catalog.toSearch(catalog.find('roda'), { raio: 'g' })}`);
  assert.equal(reopened.model.id, 'roda');
  assert.deepEqual(reopened.options, { raio: 'g' });
});
