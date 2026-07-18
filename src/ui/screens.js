import { CHAT_MAX_LENGTH } from '../rooms/chat.js';

const CHAT_TAUNTS = [
  'A corte está observando.',
  'Isso foi um blefe.',
  'Corajoso da sua parte.',
  'Sua vez, excelência.',
];

export const escapeHTML = (value) =>
  String(value).replace(
    /[&<>'"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char],
  );

export function chatToggleHTML(state) {
  if (!state.online) return '';
  const unread = Math.min(state.chatUnread, 99);
  return `<button class="chat-toggle" id="chat-toggle" type="button" aria-expanded="${state.chatOpen}" aria-label="Abrir chat da mesa"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v11H9l-5 3v-14Z"/><path d="M8 10h8M8 13h5"/></svg><small>Chat</small>${unread ? `<b>${unread}</b>` : ''}</button>`;
}

export function chatPanelHTML(state) {
  if (!state.online || !state.room || state.screen === 'lobby') return '';
  const count = Array.from(state.chatDraft).length;
  const messages = state.chatMessages.length
    ? state.chatMessages
        .map((message) => {
          const mine = message.playerId === state.myId;
          const time = new Date(message.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          return `<article class="chat-message ${mine ? 'mine' : ''} ${message.kind === 'taunt' ? 'taunt' : ''}"><span class="chat-avatar">${escapeHTML(message.playerName[0] ?? '?')}</span><div><header><strong>${escapeHTML(message.playerName || 'Convidado')}</strong><time>${time}</time></header><p>${escapeHTML(message.text)}</p></div></article>`;
        })
        .join('')
    : '<div class="chat-empty"><i>♜</i><p>A corte ainda está em silêncio.</p><small>Quebre o gelo — ou comece uma intriga.</small></div>';
  return `<div class="chat-backdrop ${state.chatOpen ? 'open' : ''}" id="chat-backdrop"></div><aside class="chat-panel ${state.chatOpen ? 'open' : ''}" aria-hidden="${!state.chatOpen}" ${state.chatOpen ? '' : 'inert'}><header class="chat-header"><div><span class="eyebrow">Conversa da mesa</span><h2>Salão da corte</h2></div><button id="chat-close" type="button" aria-label="Fechar chat">×</button></header><div class="chat-messages" id="chat-messages" aria-live="polite">${messages}</div><div class="chat-compose"><div class="chat-taunts">${CHAT_TAUNTS.map((taunt) => `<button type="button" data-taunt="${escapeHTML(taunt)}">${escapeHTML(taunt)}</button>`).join('')}</div><form id="chat-form"><textarea id="chat-input" maxlength="${CHAT_MAX_LENGTH}" rows="2" placeholder="Diga algo à corte…" ${state.connection === 'connected' ? '' : 'disabled'}>${escapeHTML(state.chatDraft)}</textarea><div class="chat-form-footer"><span class="chat-error">${escapeHTML(state.chatError ?? '')}</span><span id="chat-count">${count}/${CHAT_MAX_LENGTH}</span><button type="submit" aria-label="Enviar mensagem" ${state.connection === 'connected' ? '' : 'disabled'}>Enviar</button></div></form></div></aside>`;
}

export function connectionUIHTML(state) {
  const offline = (state.room?.seats ?? []).filter((seat) => seat.kind === 'human' && !seat.connected);
  const banner =
    offline.length && !state.hostIssue
      ? `<div class="disconnect-banner" role="status"><i></i><span>${offline.map((seat) => escapeHTML(seat.name)).join(', ')} ${offline.length === 1 ? 'está desconectado' : 'estão desconectados'} — a mesa continua.</span></div>`
      : '';

  let overlay = '';
  if (['connecting', 'reconnecting'].includes(state.connection)) {
    const reconnecting = Boolean(state.room);
    overlay = `<div class="connection-overlay" role="alert"><div class="connection-card"><i class="connection-spinner"></i><div class="eyebrow">${reconnecting ? 'Reconectando à corte' : 'Abrindo a corte'}</div><h2>${reconnecting ? 'Sua cadeira está reservada' : 'Conectando à sala'}</h2><p>${reconnecting ? 'Recuperando a sala e sua visão da partida…' : 'Preparando um canal privado para sua mesa…'}</p></div></div>`;
  } else if (state.hostIssue) {
    const candidate = escapeHTML(state.hostIssue.candidateName ?? 'outro jogador');
    const content = {
      waiting: ['Anfitrião desconectado', `Aguardando o retorno. Se ele não voltar, ${candidate} assume a mesa.`],
      ready: ['Trocando o anfitrião', `${candidate} foi escolhido para manter a partida em andamento.`],
      promoting: ['Reconstruindo a mesa', `${candidate} está reunindo as mãos privadas e assumindo como anfitrião.`],
      failed: ['Não foi possível recuperar a mesa', 'Recarregue a página para tentar retomar sua cadeira.'],
      unavailable: ['Mesa sem jogadores conectados', 'A partida será retomada quando alguém voltar.'],
      closing: [
        'Aguardando o retorno da mesa',
        'Se nenhum outro jogador voltar durante a carência, esta mesa será encerrada.',
      ],
    }[state.hostIssue.status] ?? ['Reconectando a mesa', 'Aguarde um instante…'];
    overlay = `<div class="connection-overlay" role="alert"><div class="connection-card"><i class="connection-spinner"></i><div class="eyebrow">Continuidade da partida</div><h2>${content[0]}</h2><p>${content[1]}</p></div></div>`;
  }
  return banner + overlay;
}

export function lobbyHTML(state) {
  return `<main class="shell"><nav class="topbar"><div class="brand">LA <span>CORTE</span></div></nav><section class="landing"><div><div class="eyebrow">Um jogo de poder e influência</div><h1>Toda verdade<br>é um <em>risco.</em></h1><p class="lead">Blefe, negocie e elimine seus rivais. Na corte, a confiança é a moeda mais rara.</p><div class="feature-row"><div><b>2–6</b> jogadores</div><div><b>15 min</b> por partida</div><div><b>∞</b> intrigas</div></div></div><div class="glass"><h2>Entre na corte</h2><div class="sub">Escolha como deseja disputar o poder.</div><div class="mode-grid"><button class="mode ${state.mode === 'bots' ? 'active' : ''}" data-mode="bots"><span class="mode-icon">♞</span><span><strong>Contra bots</strong><small>Partida rápida contra a corte</small></span></button><button class="mode ${state.mode === 'create' ? 'active' : ''}" data-mode="create"><span class="mode-icon">♜</span><span><strong>Criar sala</strong><small>Abra uma mesa e compartilhe o código</small></span></button><button class="mode ${state.mode === 'join' ? 'active' : ''}" data-mode="join"><span class="mode-icon">⌁</span><span><strong>Entrar em sala</strong><small>Use o código enviado pelo anfitrião</small></span></button></div><div class="field"><label>Seu nome na corte</label><input id="name" maxlength="18" value="${escapeHTML(state.name)}" placeholder="Digite seu nome" /></div>${state.mode === 'join' ? `<div class="field"><label>Código da sala</label><input id="room-code" maxlength="5" value="${escapeHTML(state.joinCode || '')}" placeholder="ABCDE" autocomplete="off" /></div>` : ''}${state.error ? `<p class="form-error">${escapeHTML(state.error)}</p>` : ''}<button class="primary" id="enter">${state.mode === 'bots' ? 'Jogar contra bots' : state.mode === 'create' ? 'Criar sala privada' : 'Entrar na sala'} →</button><p class="fine">Nenhum cadastro necessário · Salas privadas por convite</p></div></section></main>`;
}

// A tela da sala precisa renderizar antes de a sala existir: o convidado entra
// nela sob o overlay de conexão enquanto aguarda o snapshot do anfitrião.
export function roomHTML(state) {
  const room = state.room;
  const seats = room?.seats || [];
  const self = seats.find((seat) => seat.id === state.myId);
  const connected = seats.filter((seat) => seat.connected).length;
  const lateWaiting = Boolean(self?.joinsNextGame);
  const waitingCopy = lateWaiting
    ? `<p class="waiting">${room?.status === 'finished' ? 'Aguardando a próxima partida.' : 'A partida está em andamento. Você entra na próxima.'}<small>O chat da mesa já está disponível.</small></p>`
    : '<p class="waiting">Aguardando o anfitrião distribuir as cartas…</p>';
  const startLabel = room?.status === 'finished' ? 'Iniciar próxima partida' : 'Iniciar partida';
  const roomAction =
    state.isHost && room?.status !== 'playing'
      ? `<button class="primary" id="start-room" ${connected < 2 ? 'disabled' : ''}>${startLabel}</button>`
      : state.screen === 'waiting_game' || lateWaiting
        ? waitingCopy
        : '<p class="waiting">Aguardando o anfitrião iniciar…</p>';
  return `<main class="shell"><nav class="topbar"><div class="brand">LA <span>CORTE</span></div><div class="roombar-actions">${chatToggleHTML(state)}<button class="ghost" id="leave-room">Sair da sala</button></div></nav><section class="room-lobby glass"><div class="eyebrow">Sala privada</div><div class="room-code">${escapeHTML(room?.code || '•••••')}</div><p class="sub">Compartilhe este link; o código já acompanha o convite.</p><button class="copy-invite" id="copy-invite">${state.shareCopied ? '✓ Link copiado' : '↗ Copiar link da sala'}</button><div class="room-seats">${seats.map((seat) => `<div class="room-seat ${seat.connected ? '' : 'offline'} ${seat.joinsNextGame ? 'next-game' : ''}"><span class="avatar">${escapeHTML(seat.name[0] ?? '?')}</span><strong title="${escapeHTML(seat.name)}">${escapeHTML(seat.name)}</strong>${seat.id === room.hostId ? '<small>ANFITRIÃO</small>' : !seat.connected ? '<small>DESCONECTADO</small>' : seat.joinsNextGame ? '<small>PRÓXIMA PARTIDA</small>' : ''}</div>`).join('')}</div>${roomAction}</section></main>`;
}
