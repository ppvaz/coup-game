import * as THREE from 'three';
import { TabletopStage, disposeObject3D } from '@la-corte/tabletop-stage';
import {
  MODEL_CATALOG,
  MODEL_CATEGORIES,
  modelSearch,
  modelSelectionFromSearch,
} from '../lib/tabletop/model-catalog.js';
import { escapeHTML } from './screens.js';

// Direção e cor da luz são as mesmas nos dois modos — é o que faz o modelo
// parecer o mesmo objeto em qualquer tema. O nível é que precisa acompanhar a
// sala: a mesma chave que desenha uma peça sobre o breu satura um ciclorama
// claro muito antes de a peça ficar legível. No claro, a chave cede lugar a um
// hemisférico forte, que é o difusor de um estúdio de verdade.
const STUDIO_LIGHTS = { key: 0xfff2dc, fill: 0x9fb2c4 };
const THEMES = {
  dark: {
    clearColor: 0x0d0c0b,
    backdrop: 0x201d1a,
    turntable: 0x2f2823,
    levels: { key: 155, fill: 1.7, rim: 2.1, ambient: 1.25 },
  },
  light: {
    clearColor: 0x8d8474,
    backdrop: 0xa89c88,
    turntable: 0x8b8170,
    levels: { key: 52, fill: 1.1, rim: 0.85, ambient: 2.6 },
  },
};

export function modelGalleryHTML() {
  const groups = MODEL_CATEGORIES.map((category) => {
    const entries = MODEL_CATALOG.filter((model) => model.category === category.id);
    if (!entries.length) return '';
    return `<section class="gallery-group"><h2>${escapeHTML(category.label)}</h2>${entries
      .map(
        (model) =>
          `<button type="button" class="gallery-entry" data-model="${escapeHTML(model.id)}">${escapeHTML(model.label)}</button>`,
      )
      .join('')}</section>`;
  }).join('');

  return `<main class="model-gallery" data-theme-scope="gallery">
    <canvas id="gallery-canvas" aria-label="Vitrine de modelos 3D"></canvas>
    <div class="tabletop-loading" id="gallery-loading"><i></i><span>Montando a vitrine…</span></div>
    <nav class="tabletop-topbar">
      <a class="tabletop-brand" href="/lab" aria-label="Voltar ao laboratório">LA <span>CORTE</span><small>VITRINE DE MODELOS</small></a>
      <div class="tabletop-top-actions">
        <button class="tabletop-theme" id="gallery-theme" type="button"><span>☀</span><small>Modo diurno</small></button>
        <a class="tabletop-exit" href="/lab" aria-label="Voltar ao laboratório"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3h10v18H10M14 12H3m4-4-4 4 4 4"/></svg><span>Voltar ao laboratório</span></a>
      </div>
    </nav>
    <aside class="gallery-rail" aria-label="Modelos disponíveis">${groups}</aside>
    <aside class="gallery-readout" aria-live="polite">
      <span>MODELO</span>
      <strong id="gallery-name">—</strong>
      <p id="gallery-hint"></p>
      <span>DIMENSÕES</span>
      <small id="gallery-size">—</small>
    </aside>
    <div class="gallery-params" id="gallery-params"></div>
    <p class="tabletop-hint">ARRASTE PARA GIRAR · RODA PARA APROXIMAR</p>
  </main>`;
}

function createStudio(stage, theme) {
  const palette = THEMES[theme];
  const room = new THREE.Group();
  room.name = 'gallery-studio';

  // Ciclorama: um cilindro alto pelo lado de dentro dissolve o encontro do
  // chão com a parede, que é o que denuncia um modelo isolado como recorte.
  room.add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(14, 14, 16, 40, 1, true),
      new THREE.MeshStandardMaterial({ color: palette.backdrop, roughness: 1, side: THREE.BackSide }),
    ),
  );
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(14, 40),
    new THREE.MeshStandardMaterial({ color: palette.backdrop, roughness: 1 }),
  );
  // Abaixo da base do prato, nunca no mesmo plano do topo dele: dois leques de
  // triângulos em y = 0 brigam pelo mesmo pixel e desenham uma estrela.
  floor.position.y = -0.14;
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  room.add(floor);

  const turntable = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 0.08, 56),
    new THREE.MeshStandardMaterial({ color: palette.turntable, roughness: 0.86 }),
  );
  turntable.position.y = -0.04;
  turntable.receiveShadow = true;
  room.add(turntable);

  // Três pontos discretos: o modelo precisa se explicar, não posar. Com a
  // queda quase linear que o ciclorama pede, a chave passa de 100 e o fundo
  // branqueia antes de a peça ficar legível.
  const key = new THREE.SpotLight(STUDIO_LIGHTS.key, palette.levels.key, 26, 0.82, 0.4, 1.05);
  key.position.set(3.4, 6.4, 4.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  // O prato é um leque de triângulos partindo do centro. Sob luz alta, com o
  // frustum de sombra padrão indo até o alcance inteiro da luz, a precisão de
  // profundidade não distingue as faces e o leque reaparece como estrela.
  // Apertar o frustum ao redor do prato resolve mais que aumentar o desvio.
  key.shadow.camera.near = 3;
  key.shadow.camera.far = 15;
  key.shadow.bias = -0.0009;
  key.shadow.normalBias = 0.06;
  const fill = new THREE.DirectionalLight(STUDIO_LIGHTS.fill, palette.levels.fill);
  fill.position.set(-5, 3.4, 2.4);
  const rim = new THREE.DirectionalLight(STUDIO_LIGHTS.key, palette.levels.rim);
  rim.position.set(-1.6, 4.2, -6);
  room.add(
    key,
    key.target,
    fill,
    rim,
    new THREE.HemisphereLight(STUDIO_LIGHTS.key, palette.backdrop, palette.levels.ambient),
  );

  stage.add(room);
  stage.setVisualProfile({
    clearColor: palette.clearColor,
    fogColor: palette.clearColor,
    fogDensity: 0.012,
    exposure: theme === 'light' ? 0.94 : 1.12,
    grain: 0.006,
    vignette: 0.34,
  });
  return { room, turntable };
}

const FOV = 42;
const AZIMUTH = 0.72;
const ELEVATION = 0.46;

/**
 * Enquadra qualquer modelo pela esfera que o envolve, e não por uma pose
 * escrita à mão. Ângulo fixo, distância derivada: uma moeda de 22 cm e um
 * cortesão de dois metros e meio ganham o mesmo retrato em escalas diferentes.
 * Sem isso a câmera fica rasante nas peças pequenas, e o prato — que é grande —
 * toma o quadro inteiro.
 */
export function frameForBounds(box, { fov = FOV, margin = 1.42 } = {}) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 0.12);
  const distance = (radius / Math.sin((fov / 2) * (Math.PI / 180))) * margin;
  const ground = distance * Math.cos(ELEVATION);
  const orbit = (azimuth, height) => [
    ground * Math.sin(azimuth),
    center.y + distance * Math.sin(height),
    ground * Math.cos(azimuth),
  ];
  return {
    position: orbit(AZIMUTH, ELEVATION),
    target: [0, center.y, 0],
    fov,
    transitionMs: 420,
    // Em retrato a largura é que aperta: recua e sobe um pouco menos.
    portrait: { position: orbit(AZIMUTH, ELEVATION * 0.82).map((value, axis) => value * (axis === 1 ? 1 : 1.3)) },
  };
}

export async function mountModelGallery({ canvas, search = location.search, theme: initialTheme = 'dark' } = {}) {
  const requestedTheme = new URLSearchParams(search).get('theme');
  const root = document.querySelector('.model-gallery');
  const loading = document.querySelector('#gallery-loading');
  // Mesma classe do laboratório: ela esconde o alternador de tema global,
  // que aqui viraria um segundo controle para a mesma preferência.
  document.body.classList.add('is-tabletop-lab');
  let theme = ['light', 'dark'].includes(requestedTheme) ? requestedTheme : initialTheme === 'light' ? 'light' : 'dark';
  let { model, options } = modelSelectionFromSearch(search);

  const stage = new TabletopStage(canvas, { clearColor: THEMES[theme].clearColor });
  let studio = createStudio(stage, theme);
  const pedestal = stage.add(new THREE.Group());
  pedestal.name = 'gallery-pedestal';
  let current = null;
  let framed = false;
  let animate = null;

  stage.addUpdater(({ elapsed }) => animate?.(elapsed));

  // O prato acompanha a peça: um raio fixo deixaria a moeda perdida num palco
  // vazio e o cortesão pendurado para fora dele.
  let pieceRadius = 1;
  const resizeTurntable = () => studio.turntable.scale.set(pieceRadius, 1, pieceRadius);

  // O endereço é a forma de uma captura automática pedir exatamente esta peça:
  // modelo, parâmetros e tema precisam sobreviver a cada troca.
  const addressFor = () => `${modelSearch(model, options)}&theme=${theme}`;

  const paintRail = () => {
    for (const button of root.querySelectorAll('[data-model]')) {
      button.classList.toggle('active', button.dataset.model === model.id);
      button.setAttribute('aria-current', String(button.dataset.model === model.id));
    }
  };

  const paintParams = () => {
    const host = root.querySelector('#gallery-params');
    host.innerHTML = model.params
      .map(
        (param) =>
          `<div class="gallery-param"><span>${escapeHTML(param.label)}</span><div>${param.values
            .map(
              (option) =>
                `<button type="button" data-param="${escapeHTML(param.id)}" data-value="${escapeHTML(option.value)}" class="${options[param.id] === option.value ? 'active' : ''}">${escapeHTML(option.label)}</button>`,
            )
            .join('')}</div></div>`,
      )
      .join('');
    for (const button of host.querySelectorAll('[data-param]')) {
      button.addEventListener('click', () => {
        options = { ...options, [button.dataset.param]: button.dataset.value };
        void show();
      });
    }
  };

  const show = async () => {
    const made = await model.build(options);
    const built = made.isObject3D ? made : made.object;
    animate = made.isObject3D ? null : (made.animate ?? null);
    if (current) {
      pedestal.remove(current);
      disposeObject3D(current);
    }
    current = built;
    pedestal.add(built);

    // O modelo é apoiado no prato: a mesa constrói cada peça na altura em que
    // ela vive lá, e uma carta que nasce a 1,28 flutuaria aqui.
    const box = new THREE.Box3().setFromObject(built);
    const center = box.getCenter(new THREE.Vector3());
    built.position.set(-center.x, -box.min.y, -center.z);
    pedestal.rotation.y = model.yaw ?? 0;

    const seated = new THREE.Box3().setFromObject(built);
    const footprint = seated.getSize(new THREE.Vector3());
    pieceRadius = Math.max(0.42, Math.hypot(footprint.x, footprint.z) * 0.78);
    resizeTurntable();
    // A primeira peça entra sem viagem de câmera; as seguintes ganham o corte
    // curto, que é o que deixa a diferença de escala entre elas perceptível.
    stage.defineCameraAct('model', frameForBounds(seated));
    stage.setCameraAct('model', { immediate: !framed });
    framed = true;

    const size = seated.getSize(new THREE.Vector3());
    root.querySelector('#gallery-name').textContent = model.label;
    root.querySelector('#gallery-hint').textContent = model.hint;
    root.querySelector('#gallery-size').textContent =
      `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}`;
    root.dataset.model = model.id;

    history.replaceState(history.state, '', `${location.pathname}?${addressFor()}`);
    paintRail();
    loading?.classList.add('hidden');
  };

  const applyTheme = (next) => {
    theme = next;
    document.documentElement.dataset.theme = next;
    disposeObject3D(studio.room);
    studio = createStudio(stage, next);
    resizeTurntable();
    root.querySelector('#gallery-theme small').textContent = next === 'light' ? 'Modo noturno' : 'Modo diurno';
    root.querySelector('#gallery-theme span').textContent = next === 'light' ? '☾' : '☀';
    history.replaceState(history.state, '', `${location.pathname}?${addressFor()}`);
  };

  for (const button of root.querySelectorAll('[data-model]')) {
    button.addEventListener('click', () => {
      const next = MODEL_CATALOG.find((candidate) => candidate.id === button.dataset.model);
      if (!next || next.id === model.id) return;
      ({ model, options } = modelSelectionFromSearch(`?modelo=${next.id}`));
      paintParams();
      void show();
    });
  }
  root
    .querySelector('#gallery-theme')
    .addEventListener('click', () => applyTheme(theme === 'light' ? 'dark' : 'light'));

  applyTheme(theme);
  paintParams();
  await show();

  return {
    dispose() {
      if (current) disposeObject3D(current);
      stage.dispose();
    },
  };
}
