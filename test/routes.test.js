import test from 'node:test';
import assert from 'node:assert/strict';
import { isLabRoute, routeFromPath } from '../src/lib/routes.js';

test('a raiz entrega o jogo e qualquer caminho desconhecido cai nela', () => {
  assert.deepEqual(routeFromPath('/'), { name: 'home' });
  assert.deepEqual(routeFromPath('/3d'), { name: 'home' });
  assert.deepEqual(routeFromPath('/3d/lab'), { name: 'home' });
  assert.deepEqual(routeFromPath('/qualquer/coisa'), { name: 'home' });
});

test('a sala aceita apenas códigos de cinco caracteres e devolve em maiúsculas', () => {
  assert.deepEqual(routeFromPath('/sala/ab2c9'), { name: 'room', code: 'AB2C9' });
  assert.deepEqual(routeFromPath('/sala/AB2C9/'), { name: 'room', code: 'AB2C9' });
  // O alfabeto exclui 0 e 1 para não confundir com O e I no convite falado.
  assert.equal(routeFromPath('/sala/AB0C9').name, 'home');
  assert.equal(routeFromPath('/sala/AB2C').name, 'home');
  assert.equal(routeFromPath('/sala/AB2C9X').name, 'home');
});

test('o laboratório tem duas ferramentas e ambas exigem liberação', () => {
  assert.deepEqual(routeFromPath('/lab'), { name: 'lab' });
  assert.deepEqual(routeFromPath('/lab/'), { name: 'lab' });
  assert.deepEqual(routeFromPath('/lab/modelos'), { name: 'models' });
  assert.deepEqual(routeFromPath('/lab/modelos/'), { name: 'models' });
  // Uma sub-rota inexistente do lab não pode virar a mesa por acidente: cai na
  // raiz como qualquer outro endereço desconhecido.
  assert.equal(routeFromPath('/lab/inexistente').name, 'home');

  assert.equal(isLabRoute(routeFromPath('/lab')), true);
  assert.equal(isLabRoute(routeFromPath('/lab/modelos')), true);
  assert.equal(isLabRoute(routeFromPath('/')), false);
  assert.equal(isLabRoute(routeFromPath('/sala/AB2C9')), false);
});
