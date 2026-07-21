import { awaitedPlayerId } from '../game/ai.js';
import { responseProgress } from '../game/coup.js';
import { projectCoupTableView } from '../lib/tabletop/coup-view.js';
import {
  TABLETOP_BENCHMARK_DEFAULTS,
  TabletopBenchmarkKit,
  benchmarkOptionsFromSearch,
} from '../lib/tabletop/benchmark-kit.js';
import { TABLETOP_QUALITY_KEY, initialTabletopQuality, nextTabletopQuality } from '../lib/tabletop/quality-profiles.js';
import { TABLETOP_EMOJIS, TABLETOP_THROWABLES } from '../lib/tabletop/reactions.js';
import { audioTogglesHTML, bindGameDecisionControls, describeLog, handHTML, modalHTML } from './game-views.js';
import { chatPanelHTML, chatToggleHTML, escapeHTML } from './screens.js';

const player = (game, id) => game.players.find((candidate) => candidate.id === id);

const rosterBookIcon = (open) =>
  open
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5v14M3 4.5h5.5A3.5 3.5 0 0 1 12 8v12.5a3.5 3.5 0 0 0-3.5-3.5H3V4.5Zm18 0h-5.5A3.5 3.5 0 0 0 12 8v12.5a3.5 3.5 0 0 1 3.5-3.5H21V4.5Z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5h14v17H6.5A2.5 2.5 0 0 1 4 18V6a2.5 2.5 0 0 1 2.5-2.5M4 18a2.5 2.5 0 0 1 2.5-2.5H19M8 7.5h7"/></svg>';

function narrative(game) {
  const pending = game.pending;
  const latest = game.log.at(-1);
  const eventCopy = latest ? describeLog(game, latest) : 'A corte está reunida.';
  const progress = responseProgress(game);
  const progressCopy =
    progress && progress.total > 1
      ? `${progress.submitted} de ${progress.total} respostas · ${progress.remaining} ${progress.remaining === 1 ? 'pendente' : 'pendentes'}.`
      : '';
  const copy = progressCopy ? `${eventCopy} ${progressCopy}` : eventCopy;
  if (game.status === 'finished') {
    const winner = player(game, game.winnerId);
    return {
      label: 'Desfecho',
      title: `${winner?.name ?? 'A corte'} domina a mesa`,
      copy,
    };
  }
  if (game.phase === 'choose_influence') {
    return {
      label: 'Influência',
      title: `${player(game, pending.lossPlayerId)?.name ?? 'Alguém'} deve revelar uma influência`,
      copy,
    };
  }
  if (game.phase === 'exchange') {
    return {
      label: 'Troca',
      title: `${player(game, pending.actorId)?.name ?? 'A corte'} reorganiza suas influências`,
      copy,
    };
  }
  if (game.phase === 'challenge_block') {
    return {
      label: 'Intervenção',
      title: `${player(game, pending.block.playerId)?.name ?? 'Alguém'} sustenta o bloqueio`,
      copy,
    };
  }
  if (game.phase === 'block') {
    return {
      label: 'Bloqueio',
      title: 'A corte pode intervir',
      copy,
    };
  }
  if (game.phase === 'challenge_action') {
    return {
      label: 'Alegação',
      title: `${player(game, pending.actorId)?.name ?? 'Alguém'} alega ser ${pending.claimedRole}`,
      copy,
    };
  }
  const current = player(game, game.currentPlayerId);
  return {
    label: 'Turno',
    title: `${current?.name ?? 'A corte'} detém a palavra`,
    copy,
  };
}

export function tabletopRosterHTML(state, context) {
  const decisionPlayerId = awaitedPlayerId(state.game);
  return `<aside class="tabletop-roster" id="tabletop-roster" aria-label="Influências e moedas da corte"><span class="tabletop-roster-title">A CORTE</span>${state.game.players
    .map((seat) => {
      const connected = state.room?.seats.find((candidate) => candidate.id === seat.id)?.connected ?? true;
      const alive = seat.cards.some((card) => !card.revealed);
      return `<article class="tabletop-roster-player ${decisionPlayerId === seat.id ? 'active' : ''} ${alive ? '' : 'eliminated'} ${connected ? '' : 'offline'}"><button type="button" class="tabletop-roster-name" data-tabletop-focus-seat="${escapeHTML(seat.id)}" title="Focar ${escapeHTML(seat.name)}" aria-label="Focar a câmera em ${escapeHTML(seat.name)}"><span>${escapeHTML(seat.name)}</span>${seat.id === state.myId ? '<small>VOCÊ</small>' : ''}</button><span class="tabletop-roster-coins" aria-label="${seat.coins} moedas">◆ ${seat.coins}</span><span class="tabletop-roster-influences">${seat.cards
        .map(
          (card) =>
            `<i class="${card.revealed ? 'lost' : 'hidden'}" ${card.revealed ? `style="--portrait:url('${context.portraits[card.role]}')"` : ''} aria-label="${card.revealed ? `${card.role}, influência perdida` : 'Influência ativa'}">${card.revealed ? '<b>×</b>' : ''}</i>`,
        )
        .join('')}</span></article>`;
    })
    .join(
      '',
    )}<small class="tabletop-roster-hint">CLIQUE EM UM NOME PARA FOCAR</small><section class="tabletop-roster-settings" aria-label="Preferências da experiência">${context.canSwitchTo2D ? '<button class="tabletop-2d" id="tabletop-2d" type="button" title="Voltar à mesa 2D" aria-label="Voltar à mesa 2D, mantendo a partida"><span>▦</span><small>Mesa 2D</small></button>' : ''}<button class="tabletop-theme" id="tabletop-theme" type="button" title="Alternar ambiente"><span>☀</span><small>Modo diurno</small></button>${audioTogglesHTML(context)}${context.labAccess ? '<a class="tabletop-lab-link" href="/3d/lab" aria-label="Abrir laboratório 3D" title="Abrir laboratório 3D"><span>◇</span><small>Abrir laboratório 3D</small></a>' : ''}</section></aside>`;
}

export function gameplayHTML(state, context) {
  const game = state.game;
  const roster = tabletopRosterHTML(state, context);
  if (game.status !== 'finished') return roster + handHTML(state, context.portraits) + modalHTML(state, context);
  const winner = player(game, game.winnerId);
  const defeated = game.finishReason === 'humans_eliminated';
  const again =
    !state.online || state.isHost
      ? '<button class="primary" id="tabletop-again">Jogar novamente</button>'
      : '<p class="tabletop-result-waiting">Aguardando o anfitrião abrir outra mesa…</p>';
  return `${roster}<section class="tabletop-result"><span>FIM DA PARTIDA</span><strong>${defeated ? 'Você caiu da corte' : `${escapeHTML(winner?.name ?? '?')} venceu`}</strong>${again}</section>`;
}

function reactionDockHTML(state, { open, throwable }) {
  if (!state.game || !state.myId) return '';
  const targets = state.game.players.filter(
    (candidate) => candidate.id !== state.myId && candidate.cards.some((card) => !card.revealed),
  );
  const panel = !open
    ? ''
    : throwable
      ? `<aside class="tabletop-reaction-panel" role="dialog" aria-label="Escolha quem receberá o arremesso"><span>ESCOLHA O ALVO</span><div class="tabletop-reaction-targets">${targets.map((target) => `<button type="button" data-reaction-target="${escapeHTML(target.id)}">${escapeHTML(target.name)}</button>`).join('')}</div><button type="button" class="tabletop-reaction-back" data-reaction-back>← Voltar</button></aside>`
      : `<aside class="tabletop-reaction-panel" role="dialog" aria-label="Reações da corte"><span>REAGIR</span><div class="tabletop-reaction-emojis">${TABLETOP_EMOJIS.map((emoji) => `<button type="button" data-reaction-emoji="${emoji}" aria-label="Reagir com ${emoji}">${emoji}</button>`).join('')}</div><span>ARREMESSAR</span><div class="tabletop-reaction-throws">${TABLETOP_THROWABLES.map((item) => `<button type="button" data-reaction-throw="${item.id}" title="${item.label}"><b>${item.icon}</b><small>${item.label}</small></button>`).join('')}</div></aside>`;
  return `<div class="tabletop-reactions ${open ? 'open' : ''}">${panel}<button type="button" class="tabletop-reaction-trigger" id="tabletop-reaction-trigger" aria-expanded="${open}" aria-label="${open ? 'Fechar reações' : 'Abrir reações'}"><span>${open ? '×' : '☺'}</span><small>Reagir</small></button></div>`;
}

export function tableExperimentHTML({ testMode = false } = {}) {
  const mode = testMode ? 'lab' : 'game';
  return `<main class="tabletop-experiment" data-camera="auto" data-interface="${mode}">
    <canvas id="tabletop-canvas" aria-label="Mesa 3D jogável da La Corte"></canvas>
    <div class="tabletop-loading" id="tabletop-loading"><i></i><span>Convocando a corte…</span></div>
    <nav class="tabletop-topbar">
      ${testMode ? '<a class="tabletop-brand" href="/3d" aria-label="Voltar ao jogo 3D">LA <span>CORTE</span><small>LABORATÓRIO 3D</small></a>' : ''}
      ${testMode ? '<div class="tabletop-engine-badge"><i></i><span>TABLETOP STAGE</span><small>MOTOR AUTORITATIVO · INSTRUMENTAÇÃO</small></div>' : ''}
      <div class="tabletop-top-actions">
        ${testMode ? '<button class="tabletop-benchmark" id="tabletop-benchmark" type="button"><span>◷</span><small>Medir FPS</small></button>' : ''}
        ${testMode ? '<button class="tabletop-quality" id="tabletop-quality" type="button"><span>◆</span><small>Cinemático</small></button>' : ''}
        ${testMode ? '' : `<button class="tabletop-roster-toggle" id="tabletop-roster-toggle" type="button" aria-controls="tabletop-roster" aria-expanded="false"><span>${rosterBookIcon(false)}</span><small>A corte</small></button>`}
        <span class="tabletop-chat-slot" id="tabletop-chat-slot"></span>
        ${testMode ? '<button class="tabletop-theme" id="tabletop-theme" type="button"><span>☀</span><small>Modo diurno</small></button>' : ''}
        ${testMode ? '<a class="tabletop-exit" href="/3d" aria-label="Voltar ao jogo 3D"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3h10v18H10M14 12H3m4-4-4 4 4 4"/></svg><span>Voltar ao jogo 3D</span></a>' : '<button class="tabletop-exit" id="tabletop-exit-request" type="button" aria-expanded="false" aria-controls="tabletop-exit-confirm"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3h10v18H10M14 12H3m4-4-4 4 4 4"/></svg><span>Voltar ao salão</span></button>'}
      </div>
    </nav>
    ${testMode ? '' : '<aside class="tabletop-exit-confirm" id="tabletop-exit-confirm" hidden><span>ABANDONAR A PARTIDA?</span><p>O progresso desta mesa será encerrado.</p><div><button type="button" id="tabletop-exit-cancel">Continuar jogando</button><button type="button" class="exit-leave" id="tabletop-exit-leave">Sair da partida</button></div></aside>'}
    <section class="tabletop-story" aria-live="polite" aria-atomic="true">
      <span id="tabletop-kicker">TURNO · ATO 01</span>
      <h1 id="tabletop-title">A corte está reunida</h1>
      <p id="tabletop-copy">A partida será decidida pelo mesmo motor da mesa 2D.</p>
    </section>
    ${
      testMode
        ? `<aside class="tabletop-legend">
      <span>CENA ESTÁTICA</span>
      <p id="tabletop-decision">Simulação pausada</p>
      <i></i><span>LAB 3D</span><p>Ambiente · câmeras · luz · desempenho</p>
    </aside>`
        : ''
    }
    ${
      testMode
        ? `<aside class="tabletop-benchmark-panel" id="tabletop-benchmark-panel" aria-live="polite">
      <span>BENCHMARK 3D</span>
      <strong id="tabletop-benchmark-value">— FPS</strong>
      <small id="tabletop-benchmark-detail">2 s aquecimento · 8 s amostragem</small>
    </aside>`
        : ''
    }
    <div class="tabletop-gameplay" id="tabletop-gameplay"></div>
    <div id="tabletop-reaction-layer"></div>
    <div id="tabletop-chat-layer"></div>
    ${
      testMode
        ? `<div class="tabletop-controls tabletop-lab-controls">
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
    </div>
    <p class="tabletop-hint">ARRASTE PARA OLHAR · RODA PARA APROXIMAR</p>`
        : ''
    }
  </main>`;
}

export async function mountTableExperiment({
  initialState,
  context,
  dispatch,
  requestRender,
  restart,
  toggleSounds,
  toggleVoices,
  sendReaction,
  bindChat,
  switchTo2D,
  exitTable,
  testMode,
}) {
  document.body.classList.add('is-tabletop-lab');
  const root = document.querySelector('.tabletop-experiment');
  const canvas = root.querySelector('#tabletop-canvas');
  const loading = root.querySelector('#tabletop-loading');
  let scene = null;
  let cardFocusTimer = null;
  const endCardFocus = () => {
    clearTimeout(cardFocusTimer);
    cardFocusTimer = null;
    if (scene?.cameraName !== 'card') return;
    scene.setCamera('auto');
    root.dataset.camera = 'auto';
  };
  let benchmarkInterval = null;
  let benchmarkKit = null;
  let currentState = initialState;
  let currentContext = context;
  let rosterOpen = !matchMedia('(max-width: 820px)').matches;
  let focusedSeat = null;
  let reactionOpen = false;
  let reactionThrowable = null;
  const processedReactions = new Set();
  const requestedTheme = new URLSearchParams(location.search).get('theme');
  let theme = ['light', 'dark'].includes(requestedTheme)
    ? requestedTheme
    : document.documentElement.dataset.theme === 'light'
      ? 'light'
      : 'dark';
  let quality = initialTabletopQuality({ search: location.search, storage: localStorage });

  const chatState = () => {
    if (!testMode) return currentState;
    return {
      ...currentState,
      online: true,
      connection: 'connected',
      screen: 'game',
      room: currentState.room ?? { code: 'LAB3D', seats: currentState.game.players },
      chatUnread: currentState.chatOpen ? 0 : currentState.chatUnread || 2,
      chatMessages: currentState.chatMessages.length
        ? currentState.chatMessages
        : [
            {
              id: 'lab-chat-1',
              playerId: 'bot-0',
              playerName: 'Beatrice',
              text: 'A corte observa cada movimento.',
              sentAt: Date.now() - 90_000,
              kind: 'message',
            },
            {
              id: 'lab-chat-2',
              playerId: currentState.myId,
              playerName: currentState.name || 'Lorenzo',
              text: 'Então que observem com atenção.',
              sentAt: Date.now() - 25_000,
              kind: 'taunt',
            },
          ],
    };
  };

  const paintPovControl = (selection) => {
    const button = root.querySelector('[data-tabletop-camera="pov"]');
    if (!button) return;
    button.textContent = selection ? `POV · ${selection.name}` : 'POV';
    button.title = selection
      ? `Ponto de vista de ${selection.name}. Clique novamente para avançar ao próximo jogador.`
      : 'Alternar o ponto de vista entre os jogadores.';
    button.setAttribute('aria-label', button.title);
  };

  const paintQualityControl = () => {
    const button = root.querySelector('#tabletop-quality');
    if (!button) return;
    button.setAttribute('aria-label', `Qualidade 3D: ${quality.label}. Ativar próximo perfil.`);
    button.dataset.quality = quality.id;
    button.querySelector('small').textContent = quality.label;
  };

  const paintRosterControl = () => {
    root.dataset.roster = rosterOpen ? 'open' : 'closed';
    root.dataset.seatFocus = focusedSeat ? 'active' : 'idle';
    const button = root.querySelector('#tabletop-roster-toggle');
    if (!button) return;
    button.setAttribute('aria-expanded', String(rosterOpen));
    button.setAttribute(
      'aria-label',
      focusedSeat
        ? `Voltar à câmera automática e fechar a corte. Assento em foco: ${focusedSeat.name}`
        : rosterOpen
          ? 'Ocultar estado da corte'
          : 'Mostrar estado da corte',
    );
    button.querySelector('span').innerHTML = rosterBookIcon(rosterOpen);
    button.querySelector('small').textContent = 'A corte';
  };

  const focusRosterSeat = (seatId) => {
    const selection = scene?.focusSeat(seatId);
    if (!selection) return;
    root.dataset.camera = 'inspect';
    focusedSeat = selection;
    paintRosterControl();
    root.querySelectorAll('[data-tabletop-camera]').forEach((button) => button.classList.remove('active'));
  };

  const bindRosterFocus = (scope) => {
    scope.querySelectorAll('[data-tabletop-focus-seat]').forEach((button) => {
      button.addEventListener('click', () => focusRosterSeat(button.dataset.tabletopFocusSeat));
    });
  };

  const bindRosterSettings = (scope) => {
    scope.querySelector('#tabletop-2d')?.addEventListener('click', () => switchTo2D?.());
    scope.querySelector('#tabletop-theme')?.addEventListener('click', () => {
      applyTheme(theme === 'light' ? 'dark' : 'light');
    });
    scope.querySelector('#sound-toggle')?.addEventListener('click', toggleSounds);
    scope.querySelector('#voice-toggle')?.addEventListener('click', toggleVoices);
  };

  const applyQuality = (nextQuality, { persist = true } = {}) => {
    quality = nextQuality;
    if (persist) localStorage.setItem(TABLETOP_QUALITY_KEY, quality.id);
    scene?.setQuality(quality.id);
    paintQualityControl();
  };

  const paintThemeControl = () => {
    const button = root.querySelector('#tabletop-theme');
    if (!button) return;
    const light = theme === 'light';
    button.setAttribute('aria-pressed', String(light));
    button.setAttribute('aria-label', light ? 'Ativar ambiente noturno' : 'Ativar ambiente diurno');
    button.setAttribute('title', light ? 'Ativar ambiente noturno' : 'Ativar ambiente diurno');
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

  const paintChat = () => {
    const chatSlot = root.querySelector('#tabletop-chat-slot');
    const chatLayer = root.querySelector('#tabletop-chat-layer');
    const visibleChatState = chatState();
    if (chatSlot) chatSlot.innerHTML = chatToggleHTML(visibleChatState);
    if (chatLayer) chatLayer.innerHTML = chatPanelHTML(visibleChatState);
    bindChat?.();
  };

  const paintReactionDock = () => {
    const layer = root.querySelector('#tabletop-reaction-layer');
    if (!layer) return;
    layer.innerHTML = reactionDockHTML(currentState, {
      open: reactionOpen,
      throwable: reactionThrowable,
    });
    layer.querySelector('#tabletop-reaction-trigger')?.addEventListener('click', () => {
      reactionOpen = !reactionOpen;
      reactionThrowable = null;
      if (reactionOpen && rosterOpen) {
        rosterOpen = false;
        paintRosterControl();
      }
      paintReactionDock();
    });
    layer.querySelectorAll('[data-reaction-emoji]').forEach((button) => {
      button.addEventListener('click', () => {
        sendReaction?.({ kind: 'emoji', emoji: button.dataset.reactionEmoji });
        reactionOpen = false;
        paintReactionDock();
      });
    });
    layer.querySelectorAll('[data-reaction-throw]').forEach((button) => {
      button.addEventListener('click', () => {
        reactionThrowable = button.dataset.reactionThrow;
        paintReactionDock();
      });
    });
    layer.querySelectorAll('[data-reaction-target]').forEach((button) => {
      button.addEventListener('click', () => {
        sendReaction?.({ kind: 'throw', throwable: reactionThrowable, targetId: button.dataset.reactionTarget });
        reactionOpen = false;
        reactionThrowable = null;
        paintReactionDock();
      });
    });
    layer.querySelector('[data-reaction-back]')?.addEventListener('click', () => {
      reactionThrowable = null;
      paintReactionDock();
    });
  };

  const playPendingReactions = () => {
    if (!scene) return;
    for (const reaction of currentState.tabletopReactions ?? []) {
      if (processedReactions.has(reaction.id)) continue;
      const played =
        reaction.kind === 'throw'
          ? scene.throwReaction(reaction.playerId, reaction.targetId, reaction.throwable)
          : scene.showEmojiReaction(reaction.playerId, reaction.emoji);
      if (played) processedReactions.add(reaction.id);
    }
    if (processedReactions.size > 96) {
      const visibleIds = new Set((currentState.tabletopReactions ?? []).map((reaction) => reaction.id));
      for (const id of processedReactions) if (!visibleIds.has(id)) processedReactions.delete(id);
    }
  };

  const frozenLabView = (game) => {
    const view = projectCoupTableView(game, currentState.myId);
    return {
      ...view,
      id: `lab:${view.id}`,
      phase: 'lab',
      beat: 'idle',
      currentPlayer: null,
      winner: null,
      action: null,
      block: null,
      influenceLoser: null,
      responsePlayer: null,
      latestEvent: null,
      seats: view.seats.map((seat) => ({
        ...seat,
        isCurrent: false,
        isActor: false,
        isTarget: false,
        isBlocker: false,
        isWinner: false,
      })),
    };
  };

  const paintState = () => {
    const game = currentState.game;
    const gameplay = root.querySelector('#tabletop-gameplay');
    paintChat();
    paintReactionDock();

    if (testMode) {
      root.dataset.phase = 'lab';
      root.dataset.decision = 'other';
      gameplay.replaceChildren();
      scene?.sync(frozenLabView(game));
      playPendingReactions();
      scene?.setDecisionClock({ visible: false });
      paintPovControl(scene?.povSelection());
      return;
    }

    const story = narrative(game);
    const awaited = awaitedPlayerId(game);
    const decisionPlayer = player(game, awaited);
    root.dataset.phase = game.phase;
    root.querySelector('#tabletop-kicker').textContent =
      `${story.label} · ATO ${String(Math.max(1, game.turn)).padStart(2, '0')}`;
    root.querySelector('#tabletop-title').textContent = story.title;
    root.querySelector('#tabletop-copy').textContent = story.copy;
    const decision = root.querySelector('#tabletop-decision');
    if (decision)
      decision.textContent =
        game.status === 'finished'
          ? 'Partida encerrada'
          : awaited === currentState.myId
            ? 'Sua decisão'
            : `Aguardando ${decisionPlayer?.name ?? 'a corte'}`;
    root.dataset.decision = awaited === currentState.myId || currentState.targetAction ? 'self' : 'other';
    gameplay.innerHTML = gameplayHTML(currentState, currentContext);
    bindGameDecisionControls(gameplay, {
      state: currentState,
      dispatch,
      render: requestRender,
    });
    bindRosterFocus(gameplay);
    bindRosterSettings(gameplay);
    paintThemeControl();
    gameplay.querySelector('#tabletop-again')?.addEventListener('click', restart);
    scene?.sync(projectCoupTableView(game, currentState.myId));
    playPendingReactions();
    // O diretor Auto decide o ato dentro da cena; o atributo só espelha a
    // escolha para a composição CSS quando não há override manual.
    if (scene && !scene.cameraOverridden) root.dataset.camera = scene.cameraName === 'player' ? 'player' : 'auto';
    scene?.setDecisionClock({
      ...currentContext.clock,
      visible: game.status === 'playing' && game.phase === 'turn',
    });
    paintPovControl(scene?.povSelection());
  };

  const paintBenchmark = (state, result = null) => {
    const panel = root.querySelector('#tabletop-benchmark-panel');
    const button = root.querySelector('#tabletop-benchmark');
    const value = root.querySelector('#tabletop-benchmark-value');
    const detail = root.querySelector('#tabletop-benchmark-detail');
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
      root.querySelector('#tabletop-benchmark')?.removeAttribute('disabled');
    }
  };

  paintRosterControl();
  paintState();
  try {
    const { ACTION_ART, CoupTableScene } = await import('../lib/tabletop/coup-table.js');
    scene = new CoupTableScene(canvas, { theme, quality: quality.id });
    // As artes de ação carregam sob demanda na primeira alegação; aquecê-las
    // depois da abertura da cena evita pop-in sem tocar o orçamento da home/2D.
    const warmActionArt = () => {
      for (const source of Object.values(ACTION_ART)) {
        const image = new Image();
        image.decoding = 'async';
        image.src = source;
      }
    };
    if ('requestIdleCallback' in window) requestIdleCallback(warmActionArt, { timeout: 4000 });
    else setTimeout(warmActionArt, 1500);
    benchmarkKit = new TabletopBenchmarkKit({
      scene,
      storage: localStorage,
      eventTarget: window,
      globalScope: window,
      logger: console,
      prepare() {
        scene.setCamera('table');
        root.dataset.camera = 'table';
        root.querySelectorAll('[data-tabletop-camera]').forEach((button) => {
          button.classList.toggle('active', button.dataset.tabletopCamera === 'table');
        });
      },
    });
    applyTheme(theme, { persist: false });
    applyQuality(quality, { persist: false });
    paintState();
    if (testMode) {
      const labShot = new URLSearchParams(location.search).get('shot');
      if (labShot && scene.applyLabShot(labShot)) {
        root.querySelectorAll('[data-tabletop-camera]').forEach((button) => button.classList.remove('active'));
      }
    }
    // Clique/toque na carta de ação abre um cinemático de leitura; o Auto
    // retoma sozinho depois de alguns segundos ou com um segundo toque.
    canvas.addEventListener('click', (event) => {
      if (!scene) return;
      const rect = canvas.getBoundingClientRect();
      const pointer = {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
      };
      if (!scene.pickActionCard(pointer)) return;
      if (scene.cameraName === 'card') {
        endCardFocus();
        return;
      }
      if (!scene.focusActionCard()) return;
      root.dataset.camera = 'card';
      clearTimeout(cardFocusTimer);
      cardFocusTimer = setTimeout(endCardFocus, 6000);
    });
    requestAnimationFrame(() => loading?.classList.add('hidden'));
    const benchmarkOptions = benchmarkOptionsFromSearch(location.search);
    if (testMode && benchmarkOptions.autorun) setTimeout(() => runBenchmark(benchmarkOptions.durationMs), 450);
  } catch (error) {
    console.error('Não foi possível iniciar a mesa 3D:', error);
    loading.innerHTML =
      '<strong>Seu navegador não conseguiu abrir a corte 3D.</strong><span>O jogo 2D continua disponível.</span>';
    loading.classList.add('error');
  }

  root.querySelectorAll('[data-tabletop-camera]').forEach((button) => {
    button.addEventListener('click', () => {
      const cameraName = button.dataset.tabletopCamera;
      const selection =
        cameraName === 'pov' && button.classList.contains('active')
          ? scene?.cyclePovSeat()
          : scene?.setCamera(cameraName);
      root.dataset.camera = cameraName;
      paintPovControl(selection ?? scene?.povSelection());
      root.querySelectorAll('[data-tabletop-camera]').forEach((candidate) => candidate.classList.remove('active'));
      button.classList.add('active');
    });
  });
  if (testMode) {
    root.querySelector('#tabletop-theme')?.addEventListener('click', () => {
      applyTheme(theme === 'light' ? 'dark' : 'light');
    });
  }
  const exitRequest = root.querySelector('#tabletop-exit-request');
  const exitConfirm = root.querySelector('#tabletop-exit-confirm');
  const closeExitConfirm = () => {
    if (!exitConfirm) return;
    exitConfirm.hidden = true;
    exitRequest?.setAttribute('aria-expanded', 'false');
  };
  exitRequest?.addEventListener('click', () => {
    const opening = exitConfirm?.hidden ?? false;
    if (!exitConfirm) return;
    exitConfirm.hidden = !opening;
    exitRequest.setAttribute('aria-expanded', String(opening));
  });
  root.querySelector('#tabletop-exit-cancel')?.addEventListener('click', closeExitConfirm);
  root.querySelector('#tabletop-exit-leave')?.addEventListener('click', () => exitTable?.());
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeExitConfirm();
  });
  root.querySelector('#tabletop-roster-toggle')?.addEventListener('click', () => {
    if (reactionOpen) {
      reactionOpen = false;
      reactionThrowable = null;
      paintReactionDock();
    }
    if (focusedSeat) {
      scene?.setCamera('auto');
      root.dataset.camera = 'auto';
      focusedSeat = null;
      rosterOpen = false;
      paintRosterControl();
      return;
    }
    rosterOpen = !rosterOpen;
    paintRosterControl();
  });
  root.querySelector('#tabletop-quality')?.addEventListener('click', () => {
    applyQuality(nextTabletopQuality(quality.id));
  });
  root.querySelector('#tabletop-benchmark')?.addEventListener('click', () => runBenchmark());

  const syncThemeFromStorage = (event) => {
    if (event.key === 'la-corte-theme' && event.newValue) applyTheme(event.newValue, { persist: false });
  };
  window.addEventListener('storage', syncThemeFromStorage);

  return {
    update(nextState, nextContext) {
      currentState = nextState;
      currentContext = nextContext;
      paintState();
    },
    dispose() {
      clearInterval(benchmarkInterval);
      clearTimeout(cardFocusTimer);
      window.removeEventListener('storage', syncThemeFromStorage);
      scene?.dispose();
      document.body.classList.remove('is-tabletop-lab');
    },
  };
}
