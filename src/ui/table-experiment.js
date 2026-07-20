import { projectCoupTableView } from '../lib/tabletop/coup-view.js';
import {
  TABLETOP_BENCHMARK_DEFAULTS,
  TabletopBenchmarkKit,
  benchmarkOptionsFromSearch,
} from '../lib/tabletop/benchmark-kit.js';
import { TABLETOP_QUALITY_KEY, initialTabletopQuality, nextTabletopQuality } from '../lib/tabletop/quality-profiles.js';
import { escapeHTML } from './screens.js';

const STEPS = [
  {
    id: 'turn',
    label: 'Turno',
    title: 'Lorenzo reúne a corte',
    copy: 'O selo dourado marca quem detém a palavra. Arraste para olhar ao redor da mesa.',
  },
  {
    id: 'claim',
    label: 'Alegação',
    title: 'Vittorio alega ser Capitão',
    copy: 'A carta alegada sobe ao centro. A regra continua no motor de Coup; o palco recebe só o fato exibível.',
  },
  {
    id: 'challenge',
    label: 'Contestação',
    title: 'Beatrice exige provas',
    copy: 'Os dois assentos ganham foco e a câmera encena o duelo sem conhecer a mão secreta do rival.',
  },
  {
    id: 'block',
    label: 'Bloqueio',
    title: 'Ajuda externa sob ameaça',
    copy: 'A janela de resposta vira uma batida visual, mantendo os controles acessíveis na camada 2D.',
  },
  {
    id: 'block-claim',
    label: 'Intervenção',
    title: 'Isabella alega ser Duque',
    copy: 'O palco destaca quem bloqueia e troca o documento central, sem assumir se a alegação é verdadeira.',
  },
  {
    id: 'loss',
    label: 'Influência',
    title: 'Uma influência deve cair',
    copy: 'A escolha continua privada no modal existente. A mesa apenas enquadra o momento dramático.',
  },
  {
    id: 'victory',
    label: 'Vitória',
    title: 'A corte tem uma soberana',
    copy: 'Luz, câmera e atuação reagem ao resultado já decidido pelo motor autoritativo.',
  },
];

const BASE_PLAYERS = [
  {
    id: 'you',
    name: 'Lorenzo',
    kind: 'human',
    connected: true,
    coins: 4,
    cards: [
      { id: 'private-duke', role: 'Duque', revealed: false },
      { id: 'private-countess', role: 'Condessa', revealed: false },
    ],
  },
  {
    id: 'bea',
    name: 'Beatrice',
    kind: 'bot',
    connected: true,
    coins: 5,
    cards: [
      { id: 'secret-bea-1', role: 'Assassina', revealed: false },
      { id: 'secret-bea-2', role: 'Duque', revealed: false },
    ],
  },
  {
    id: 'vit',
    name: 'Vittorio',
    kind: 'bot',
    connected: true,
    coins: 2,
    cards: [
      { id: 'secret-vit-1', role: 'Capitão', revealed: false },
      { id: 'secret-vit-2', role: 'Embaixadora', revealed: false },
    ],
  },
  {
    id: 'isa',
    name: 'Isabella',
    kind: 'bot',
    connected: true,
    coins: 7,
    cards: [
      { id: 'secret-isa-1', role: 'Condessa', revealed: false },
      { id: 'secret-isa-2', role: 'Duque', revealed: false },
    ],
  },
];

function demoGame(stepId) {
  const game = {
    gameId: 'laboratorio-3d',
    version: STEPS.findIndex((step) => step.id === stepId) + 1,
    status: 'playing',
    phase: 'turn',
    players: structuredClone(BASE_PLAYERS),
    currentPlayerId: 'you',
    turn: 4,
    pending: null,
    responseQueue: [],
    winnerId: null,
    log: [{ type: 'game_started', at: 1 }],
  };
  if (stepId === 'claim' || stepId === 'challenge') {
    game.phase = 'challenge_action';
    game.currentPlayerId = 'vit';
    game.pending = { action: 'steal', actorId: 'vit', targetId: 'bea', claimedRole: 'Capitão', paidCost: 0 };
    game.responseQueue = ['bea', 'isa', 'you'];
    game.log.push({ type: 'action_declared', action: 'steal', actorId: 'vit', targetId: 'bea', at: 2 });
    if (stepId === 'challenge') {
      game.phase = 'choose_influence';
      game.pending.lossPlayerId = 'bea';
      game.pending.afterLoss = 'continue_action';
      game.log.push({
        type: 'challenge_resolved',
        challengerId: 'bea',
        challengedId: 'vit',
        claimedRole: 'Capitão',
        truthful: true,
        at: 3,
      });
    }
  }
  if (stepId === 'block' || stepId === 'block-claim') {
    game.phase = stepId === 'block' ? 'block' : 'challenge_block';
    game.currentPlayerId = 'vit';
    game.pending = {
      action: 'foreign_aid',
      actorId: 'vit',
      targetId: null,
      claimedRole: null,
      paidCost: 0,
      ...(stepId === 'block-claim' ? { block: { playerId: 'isa', role: 'Duque' } } : {}),
    };
    game.responseQueue = stepId === 'block' ? ['isa', 'you', 'bea'] : ['you', 'bea', 'vit'];
    game.log.push({ type: 'action_declared', action: 'foreign_aid', actorId: 'vit', at: 2 });
    if (stepId === 'block-claim') {
      game.log.push({ type: 'block_declared', action: 'foreign_aid', playerId: 'isa', role: 'Duque', at: 3 });
    }
  }
  if (stepId === 'loss') {
    game.phase = 'choose_influence';
    game.currentPlayerId = 'isa';
    game.pending = {
      action: 'coup',
      actorId: 'isa',
      targetId: 'bea',
      claimedRole: null,
      paidCost: 7,
      lossPlayerId: 'bea',
      afterLoss: 'finish_turn',
    };
    game.log.push({ type: 'action_declared', action: 'coup', actorId: 'isa', targetId: 'bea', at: 2 });
  }
  if (stepId === 'victory') {
    game.status = 'finished';
    game.phase = 'finished';
    game.currentPlayerId = 'isa';
    game.winnerId = 'isa';
    game.players[0].cards.forEach((card) => (card.revealed = true));
    game.players[1].cards.forEach((card) => (card.revealed = true));
    game.players[2].cards.forEach((card) => (card.revealed = true));
    game.log.push({ type: 'game_finished', winnerId: 'isa', reason: 'last_survivor', at: 4 });
  }
  return game;
}

export function tableExperimentHTML() {
  return `<main class="tabletop-experiment" data-camera="auto">
    <canvas id="tabletop-canvas" aria-label="Experimento de mesa 3D da La Corte"></canvas>
    <div class="tabletop-loading" id="tabletop-loading"><i></i><span>Convocando a corte…</span></div>
    <nav class="tabletop-topbar">
      <a class="tabletop-brand" href="/" aria-label="Voltar à La Corte">LA <span>CORTE</span><small>LABORATÓRIO 3D</small></a>
      <div class="tabletop-engine-badge"><i></i><span>TABLETOP STAGE</span><small>ENGINE COMUM · AMBIENTE COUP</small></div>
      <div class="tabletop-top-actions">
        <button class="tabletop-benchmark" id="tabletop-benchmark" type="button"><span>◷</span><small>Medir FPS</small></button>
        <button class="tabletop-quality" id="tabletop-quality" type="button"><span>◆</span><small>Cinemático</small></button>
        <button class="tabletop-theme" id="tabletop-theme" type="button"><span>☀</span><small>Modo diurno</small></button>
        <a class="tabletop-exit" href="/">Voltar ao jogo</a>
      </div>
    </nav>
    <section class="tabletop-story" aria-live="polite">
      <span id="tabletop-kicker">${escapeHTML(STEPS[0].label)} · ATO 01</span>
      <h1 id="tabletop-title">${escapeHTML(STEPS[0].title)}</h1>
      <p id="tabletop-copy">${escapeHTML(STEPS[0].copy)}</p>
    </section>
    <aside class="tabletop-legend">
      <span>PALCO 3D</span>
      <p>Câmara palaciana 360° · skyline · portal · luz · assentos</p>
      <i></i>
      <span>COUP</span>
      <p>Regras · sigilo · ações · autoridade</p>
    </aside>
    <aside class="tabletop-benchmark-panel" id="tabletop-benchmark-panel" aria-live="polite">
      <span>BENCHMARK 3D</span>
      <strong id="tabletop-benchmark-value">— FPS</strong>
      <small id="tabletop-benchmark-detail">2 s aquecimento · 8 s amostragem</small>
    </aside>
    <div class="tabletop-controls">
      <div class="tabletop-beats" role="group" aria-label="Momentos da partida">
        ${STEPS.map((step, index) => `<button data-tabletop-step="${step.id}" class="${index === 0 ? 'active' : ''}"><b>${String(index + 1).padStart(2, '0')}</b><span>${escapeHTML(step.label)}</span></button>`).join('')}
      </div>
      <div class="tabletop-cameras" role="group" aria-label="Câmeras">
        <span>CÂMERA</span>
        ${[
          ['auto', 'Auto'],
          ['table', 'Mesa'],
          ['player', 'Jogador'],
          ['pov', 'POV'],
          ['duel', 'Duelo'],
          ['overhead', 'Zenital'],
          ['portal', 'Portal'],
        ]
          .map(
            ([id, label], index) =>
              `<button data-tabletop-camera="${id}" class="${index === 0 ? 'active' : ''}">${label}</button>`,
          )
          .join('')}
      </div>
      <button class="tabletop-play" id="tabletop-play" aria-pressed="true"><i></i><span>PAUSAR SEQUÊNCIA</span></button>
    </div>
    <p class="tabletop-hint">ARRASTE PARA OLHAR · RODA PARA APROXIMAR</p>
  </main>`;
}

export async function mountTableExperiment() {
  document.body.classList.add('is-tabletop-lab');
  const canvas = document.querySelector('#tabletop-canvas');
  const loading = document.querySelector('#tabletop-loading');
  let scene = null;
  let activeIndex = 0;
  let playing = true;
  let interval = null;
  let benchmarkInterval = null;
  let benchmarkKit = null;
  const requestedTheme = new URLSearchParams(location.search).get('theme');
  let theme = ['light', 'dark'].includes(requestedTheme)
    ? requestedTheme
    : document.documentElement.dataset.theme === 'light'
      ? 'light'
      : 'dark';
  let quality = initialTabletopQuality({ search: location.search, storage: localStorage });

  const paintPovControl = (selection) => {
    const button = document.querySelector('[data-tabletop-camera="pov"]');
    if (!button) return;
    button.textContent = selection ? `POV · ${selection.name}` : 'POV';
    button.title = selection
      ? `Ponto de vista de ${selection.name}. Clique novamente para avançar ao próximo jogador.`
      : 'Alternar o ponto de vista entre os jogadores.';
    button.setAttribute('aria-label', button.title);
  };

  const paintQualityControl = () => {
    const button = document.querySelector('#tabletop-quality');
    if (!button) return;
    button.setAttribute('aria-label', `Qualidade 3D: ${quality.label}. Ativar próximo perfil.`);
    button.dataset.quality = quality.id;
    button.querySelector('small').textContent = quality.label;
  };

  const applyQuality = (nextQuality, { persist = true } = {}) => {
    quality = nextQuality;
    if (persist) localStorage.setItem(TABLETOP_QUALITY_KEY, quality.id);
    scene?.setQuality(quality.id);
    paintQualityControl();
  };

  const paintThemeControl = () => {
    const button = document.querySelector('#tabletop-theme');
    if (!button) return;
    const light = theme === 'light';
    button.setAttribute('aria-pressed', String(light));
    button.setAttribute('aria-label', light ? 'Ativar ambiente noturno' : 'Ativar ambiente diurno');
    button.querySelector('span').textContent = light ? '☾' : '☀';
    button.querySelector('small').textContent = light ? 'Modo noturno' : 'Modo diurno';
  };

  const applyTheme = (nextTheme, { persist = true } = {}) => {
    theme = nextTheme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    if (persist) localStorage.setItem('la-corte-theme', theme);
    document.querySelector('meta[name="theme-color"]').content = theme === 'light' ? '#d8c9ae' : '#090807';
    scene?.setTheme(theme);
    paintThemeControl();
  };

  const showStep = (index) => {
    activeIndex = (index + STEPS.length) % STEPS.length;
    const step = STEPS[activeIndex];
    const view = projectCoupTableView(demoGame(step.id), 'you');
    scene?.sync(view);
    document.querySelector('#tabletop-kicker').textContent =
      `${step.label} · ATO ${String(activeIndex + 1).padStart(2, '0')}`;
    document.querySelector('#tabletop-title').textContent = step.title;
    document.querySelector('#tabletop-copy').textContent = step.copy;
    let activeStepButton = null;
    document.querySelectorAll('[data-tabletop-step]').forEach((button) => {
      button.classList.toggle('active', button.dataset.tabletopStep === step.id);
      if (button.dataset.tabletopStep === step.id) activeStepButton = button;
    });
    if (matchMedia('(max-width: 820px)').matches) {
      activeStepButton?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
    paintPovControl(scene?.povSelection());
  };

  const resetInterval = () => {
    clearInterval(interval);
    if (playing) interval = setInterval(() => showStep(activeIndex + 1), 5200);
  };

  const paintBenchmark = (state, result = null) => {
    const panel = document.querySelector('#tabletop-benchmark-panel');
    const button = document.querySelector('#tabletop-benchmark');
    const value = document.querySelector('#tabletop-benchmark-value');
    const detail = document.querySelector('#tabletop-benchmark-detail');
    panel?.classList.toggle('visible', Boolean(state || result));
    if (button) {
      button.disabled = Boolean(state);
      button.querySelector('small').textContent = state ? 'Medindo…' : 'Medir FPS';
    }
    if (result) {
      value.textContent = `${result.averageFps.toFixed(1)} FPS`;
      detail.textContent = `${result.quality} · p95 ${result.p95FrameMs.toFixed(1)} ms · ${result.drawCalls} chamadas · ${result.activeLights} luzes · ${result.shadowCasters} sombras · ${result.renderWidth}×${result.renderHeight}`;
      return;
    }
    if (!state) return;
    const label = state.phase === 'warmup' ? 'AQUECENDO' : 'AMOSTRANDO';
    value.textContent = `${label} ${Math.min(100, Math.round(state.progress * 100))}%`;
    detail.textContent = `${state.frameCount} frames válidos · mantenha esta aba visível`;
  };

  const runBenchmark = async (durationMs = TABLETOP_BENCHMARK_DEFAULTS.durationMs) => {
    if (!benchmarkKit || benchmarkKit.running) return null;
    benchmarkInterval = setInterval(() => paintBenchmark(benchmarkKit.state()), 100);
    paintBenchmark({ phase: 'warmup', progress: 0, frameCount: 0 });
    try {
      const result = await benchmarkKit.run({ durationMs });
      if (!result) return null;
      paintBenchmark(null, result);
      return result;
    } finally {
      clearInterval(benchmarkInterval);
      benchmarkInterval = null;
      document.querySelector('#tabletop-benchmark')?.removeAttribute('disabled');
    }
  };

  try {
    const { CoupTableScene } = await import('../lib/tabletop/coup-table.js');
    scene = new CoupTableScene(canvas, { theme, quality: quality.id });
    benchmarkKit = new TabletopBenchmarkKit({
      scene,
      storage: localStorage,
      eventTarget: window,
      globalScope: window,
      logger: console,
      prepare() {
        playing = false;
        resetInterval();
        document.querySelector('#tabletop-play')?.setAttribute('aria-pressed', 'false');
        const playLabel = document.querySelector('#tabletop-play span');
        if (playLabel) playLabel.textContent = 'REPRODUZIR SEQUÊNCIA';
        showStep(1);
        scene.setCamera('table');
        document.querySelector('.tabletop-experiment')?.setAttribute('data-camera', 'table');
        document.querySelectorAll('[data-tabletop-camera]').forEach((button) => {
          button.classList.toggle('active', button.dataset.tabletopCamera === 'table');
        });
      },
    });
    applyTheme(theme, { persist: false });
    applyQuality(quality, { persist: false });
    showStep(0);
    requestAnimationFrame(() => loading?.classList.add('hidden'));
    resetInterval();
    const benchmarkOptions = benchmarkOptionsFromSearch(location.search);
    if (benchmarkOptions.autorun) setTimeout(() => runBenchmark(benchmarkOptions.durationMs), 450);
  } catch (error) {
    console.error('Não foi possível iniciar a mesa 3D:', error);
    loading.innerHTML =
      '<strong>Seu navegador não conseguiu abrir a corte 3D.</strong><span>O jogo 2D continua disponível.</span>';
    loading.classList.add('error');
  }

  document.querySelectorAll('[data-tabletop-step]').forEach((button) => {
    button.addEventListener('click', () => {
      showStep(STEPS.findIndex((step) => step.id === button.dataset.tabletopStep));
      resetInterval();
    });
  });
  document.querySelectorAll('[data-tabletop-camera]').forEach((button) => {
    button.addEventListener('click', () => {
      const cameraName = button.dataset.tabletopCamera;
      const selection =
        cameraName === 'pov' && button.classList.contains('active')
          ? scene?.cyclePovSeat()
          : scene?.setCamera(cameraName);
      document.querySelector('.tabletop-experiment')?.setAttribute('data-camera', cameraName);
      paintPovControl(selection ?? scene?.povSelection());
      document.querySelectorAll('[data-tabletop-camera]').forEach((candidate) => candidate.classList.remove('active'));
      button.classList.add('active');
    });
  });
  document.querySelector('#tabletop-play')?.addEventListener('click', (event) => {
    playing = !playing;
    event.currentTarget.setAttribute('aria-pressed', String(playing));
    event.currentTarget.querySelector('span').textContent = playing ? 'PAUSAR SEQUÊNCIA' : 'REPRODUZIR SEQUÊNCIA';
    resetInterval();
  });
  document.querySelector('#tabletop-theme')?.addEventListener('click', () => {
    applyTheme(theme === 'light' ? 'dark' : 'light');
  });
  document.querySelector('#tabletop-quality')?.addEventListener('click', () => {
    applyQuality(nextTabletopQuality(quality.id));
  });
  document.querySelector('#tabletop-benchmark')?.addEventListener('click', () => runBenchmark());

  const syncThemeFromStorage = (event) => {
    if (event.key === 'la-corte-theme' && event.newValue) applyTheme(event.newValue, { persist: false });
  };
  window.addEventListener('storage', syncThemeFromStorage);

  return () => {
    clearInterval(interval);
    clearInterval(benchmarkInterval);
    window.removeEventListener('storage', syncThemeFromStorage);
    scene?.dispose();
    document.body.classList.remove('is-tabletop-lab');
  };
}
