import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  PROP_MANIFEST_SCHEMA,
  PropLibrary,
  fitPropToFootprint,
  parsePropManifest,
} from '@la-corte/tabletop-stage/prop-library';

const manifest = () => ({
  schema: PROP_MANIFEST_SCHEMA,
  id: 'tribunal-props',
  label: 'Props',
  version: 1,
  source: { uri: './props.glb' },
  coordinateSystem: { metersPerUnit: 1, forward: '+z', up: '+y' },
  props: { throne: 'PropThrone', chair: 'PropChair' },
});

test('aceita um manifesto bem formado', () => {
  const parsed = parsePropManifest(manifest());
  assert.equal(parsed.id, 'tribunal-props');
  assert.deepEqual({ ...parsed.props }, { throne: 'PropThrone', chair: 'PropChair' });
});

test('recusa manifesto de outro schema ou malformado', () => {
  assert.equal(parsePropManifest(null), null);
  assert.equal(parsePropManifest({ ...manifest(), schema: 'outro/v1' }), null);
  assert.equal(parsePropManifest({ ...manifest(), props: {} }), null);
  assert.equal(parsePropManifest({ ...manifest(), source: {} }), null);
  assert.equal(
    parsePropManifest({ ...manifest(), coordinateSystem: { metersPerUnit: 0, forward: '+z', up: '+y' } }),
    null,
  );
  assert.equal(
    parsePropManifest({ ...manifest(), coordinateSystem: { metersPerUnit: 1, forward: '+x', up: '+y' } }),
    null,
  );
});

function fakeGltf() {
  const scene = new THREE.Group();
  const throne = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshBasicMaterial());
  throne.name = 'PropThrone';
  const chair = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  chair.name = 'PropChair';
  scene.add(throne, chair);
  return { scene };
}

function stubFetch(payload, { ok = true } = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok, json: async () => payload });
  return () => {
    globalThis.fetch = original;
  };
}

test('carrega props do manifesto e entrega clones independentes', async () => {
  const restore = stubFetch(manifest());
  try {
    const library = new PropLibrary({ loader: { loadAsync: async () => fakeGltf() } });
    assert.equal(await library.load('http://local/mesa/manifest.json'), true);
    assert.equal(library.ready, true);
    assert.deepEqual(library.names(), ['chair', 'throne']);

    const first = library.create('throne');
    const second = library.create('throne');
    assert.ok(first && second);
    assert.notEqual(first, second, 'cada chamada devolve um clone próprio');
    first.position.x = 5;
    assert.equal(second.position.x, 0, 'mover um clone não move o outro');
    assert.equal(library.create('inexistente'), null);
    library.dispose();
  } finally {
    restore();
  }
});

test('falha de rede não lança e deixa a biblioteca vazia', async () => {
  const restore = stubFetch(null, { ok: false });
  try {
    const library = new PropLibrary({ loader: { loadAsync: async () => fakeGltf() } });
    assert.equal(await library.load('http://local/mesa/manifest.json'), false);
    assert.equal(library.ready, false);
    assert.equal(library.create('throne'), null);
  } finally {
    restore();
  }
});

test('erro do loader também resolve como falha silenciosa', async () => {
  const restore = stubFetch(manifest());
  try {
    const library = new PropLibrary({
      loader: {
        loadAsync: async () => {
          throw new Error('glb corrompido');
        },
      },
    });
    assert.equal(await library.load('http://local/mesa/manifest.json'), false);
    assert.equal(library.ready, false);
  } finally {
    restore();
  }
});

test('fitPropToFootprint ajusta largura e apoia a base no chão', () => {
  const prop = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshBasicMaterial());
  fitPropToFootprint(prop, { width: 1.42 });
  const box = new THREE.Box3().setFromObject(prop);
  const size = box.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 1.42) < 1e-6, 'largura passa a ser a pedida');
  assert.ok(Math.abs(box.min.y) < 1e-6, 'a base encosta em y=0');
});

test('fitPropToFootprint pode virar o prop meia-volta', () => {
  const prop = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshBasicMaterial());
  fitPropToFootprint(prop, { width: 1.42, faceForward: true });
  assert.ok(Math.abs(prop.rotation.y - Math.PI) < 1e-6);
});
