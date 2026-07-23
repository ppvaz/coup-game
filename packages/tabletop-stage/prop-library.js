import * as THREE from 'three';

/**
 * Biblioteca de props: um GLB, muitos objetos de cena.
 *
 * Personagem tem contrato próprio porque carrega rig, clips e expressão. Prop é
 * malha estática com nome, e um contrato de ator inteiro para uma cadeira seria
 * cerimônia sem retorno — daí um schema separado e mínimo.
 *
 * Um arquivo para todos os props é deliberado: oito downloads de 10 KB custam
 * mais em latência do que um de 90 KB, e o palco precisa de todos juntos.
 *
 * O carregamento nunca é obrigatório: quem consome continua funcionando com a
 * geometria procedural quando a biblioteca falha. Asset ausente não pode
 * esvaziar a mesa.
 *
 * Motor, não jogo: nada aqui sabe o que é uma influência ou um cortesão. O
 * jogo escolhe o manifesto e o que fazer com cada apelido.
 */

export const PROP_MANIFEST_SCHEMA = 'a-mesa.props/v1';

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const safeName = (value, max = 120) => typeof value === 'string' && value.length > 0 && value.length <= max;

/** Valida a forma do manifesto antes de qualquer download de geometria. */
export function parsePropManifest(value) {
  if (!isRecord(value) || value.schema !== PROP_MANIFEST_SCHEMA) return null;
  if (!safeName(value.id) || !safeName(value.label)) return null;
  if (!isRecord(value.source) || !safeName(value.source.uri, 300)) return null;
  if (!isRecord(value.coordinateSystem)) return null;
  const system = value.coordinateSystem;
  if (typeof system.metersPerUnit !== 'number' || !Number.isFinite(system.metersPerUnit) || system.metersPerUnit <= 0) {
    return null;
  }
  if (system.forward !== '+z' && system.forward !== '-z') return null;
  if (system.up !== '+y') return null;
  if (!isRecord(value.props)) return null;

  const props = {};
  for (const [alias, node] of Object.entries(value.props)) {
    if (!safeName(alias, 60) || !safeName(node)) continue;
    props[alias] = node;
  }
  if (!Object.keys(props).length) return null;

  return Object.freeze({
    schema: PROP_MANIFEST_SCHEMA,
    id: value.id,
    label: value.label,
    version: Number(value.version) || 1,
    source: Object.freeze({ uri: value.source.uri }),
    coordinateSystem: Object.freeze({
      metersPerUnit: Number(system.metersPerUnit),
      forward: system.forward,
      up: '+y',
    }),
    props: Object.freeze(props),
  });
}

/**
 * Carrega o GLB e entrega clones independentes por apelido. Geometria e
 * material ficam compartilhados entre os clones — seis cadeiras na mesa são
 * seis nós apontando para a mesma malha. Quem precisar pintar um clone deve
 * clonar o material antes.
 */
export class PropLibrary {
  #loader;
  #manifest = null;
  #models = new Map();
  #loading = null;
  #disposed = false;

  constructor({ loader = null } = {}) {
    this.#loader = loader;
  }

  async #resolveLoader() {
    if (this.#loader) return this.#loader;
    // O loader do glTF só entra no bundle de quem realmente abre a cena.
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    this.#loader = new GLTFLoader();
    return this.#loader;
  }

  /**
   * Resolve `true` quando a biblioteca está pronta e `false` em qualquer falha.
   * Nunca lança: o chamador segue com a geometria procedural.
   */
  async load(manifestUrl) {
    if (this.#loading) return this.#loading;
    this.#loading = (async () => {
      try {
        const response = await fetch(manifestUrl);
        if (!response.ok) return false;
        const manifest = parsePropManifest(await response.json());
        if (!manifest || this.#disposed) return false;

        const base = new URL(manifestUrl, globalThis.location?.href ?? 'http://local/');
        const url = new URL(manifest.source.uri, base).toString();
        const loader = await this.#resolveLoader();
        const gltf = await loader.loadAsync(url);
        if (this.#disposed) return false;

        const scale = manifest.coordinateSystem.metersPerUnit;
        for (const [alias, nodeName] of Object.entries(manifest.props)) {
          const node = gltf.scene.getObjectByName(nodeName);
          if (!node) continue;
          // Solta do pai para o clone não herdar a transformação da cena do
          // arquivo, que não tem relação com onde o prop vai parar no palco.
          node.removeFromParent();
          node.position.set(0, 0, 0);
          node.rotation.set(0, manifest.coordinateSystem.forward === '-z' ? Math.PI : 0, 0);
          node.scale.setScalar(scale);
          this.#models.set(alias, node);
        }
        this.#manifest = manifest;
        return this.#models.size > 0;
      } catch {
        return false;
      }
    })();
    return this.#loading;
  }

  get ready() {
    return !this.#disposed && this.#models.size > 0;
  }

  get id() {
    return this.#manifest?.id ?? null;
  }

  names() {
    return [...this.#models.keys()].sort();
  }

  /** Clone independente do prop, ou `null` se a biblioteca não o tiver. */
  create(alias) {
    const model = this.#models.get(alias);
    if (!model || this.#disposed) return null;
    const clone = model.clone(true);
    clone.name = alias;
    clone.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true;
        object.receiveShadow = false;
      }
    });
    return clone;
  }

  /** Custo geométrico somado de todos os props carregados. */
  metrics() {
    let triangles = 0;
    let meshes = 0;
    for (const model of this.#models.values()) {
      model.traverse((object) => {
        if (!object.isMesh) return;
        meshes += 1;
        const index = object.geometry.getIndex();
        const position = object.geometry.getAttribute('position');
        const count = index ? index.count : (position?.count ?? 0);
        triangles += Math.floor(count / 3);
      });
    }
    return Object.freeze({ props: this.#models.size, triangles, meshes });
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const model of this.#models.values()) {
      model.traverse((object) => {
        if (!object.isMesh) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material?.dispose();
      });
    }
    this.#models.clear();
    this.#manifest = null;
  }
}

/**
 * Reposiciona um prop para ocupar o lugar de uma peça procedural: mesma
 * largura, base no chão e frente virada para onde a cena olha. Sem isso, a
 * escala do arquivo decide o tamanho da cadeira na mesa.
 */
export function fitPropToFootprint(prop, { width, faceForward = false } = {}) {
  if (faceForward) prop.rotation.y += Math.PI;
  prop.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(prop);
  if (box.isEmpty()) return prop;
  const size = box.getSize(new THREE.Vector3());
  if (width && size.x > 0) {
    const factor = width / size.x;
    prop.scale.multiplyScalar(factor);
    prop.updateMatrixWorld(true);
    box.setFromObject(prop);
  }
  prop.position.y -= box.min.y;
  return prop;
}
