import test from 'node:test';
import assert from 'node:assert/strict';
import { chatPanelHTML, chatToggleHTML, connectionUIHTML, escapeHTML, lobbyHTML, roomHTML } from '../src/ui/screens.js';

const baseState = {
  screen: 'lobby',
  mode: 'bots',
  joinCode: '',
  name: '',
  error: null,
  shareCopied: false,
  online: false,
  isHost: false,
  myId: null,
  room: null,
  connection: 'idle',
  hostIssue: null,
  chatOpen: false,
  chatMessages: [],
  chatDraft: '',
  chatUnread: 0,
  chatError: null,
  commandError: null,
};

const seat = (id, extra = {}) => ({ id, name: id, kind: 'human', connected: true, ...extra });

test('a tela da sala renderiza antes de o snapshot chegar (regressão DM9HH)', () => {
  const html = roomHTML({ ...baseState, screen: 'room', online: true, myId: 'guest', connection: 'connecting' });
  assert.match(html, /•••••/);
  assert.match(html, /Aguardando o anfitrião iniciar/);
});

test('anfitrião só inicia com dois conectados e reinicia após o fim', () => {
  const room = { code: 'ABCDE', hostId: 'host', status: 'lobby', seats: [seat('host')] };
  const state = { ...baseState, screen: 'room', online: true, isHost: true, myId: 'host', room };

  assert.match(roomHTML(state), /id="start-room" disabled/);
  room.seats.push(seat('guest'));
  assert.match(roomHTML(state), /id="start-room" >Iniciar partida/);
  room.status = 'finished';
  assert.match(roomHTML(state), /Iniciar próxima partida/);
  room.status = 'playing';
  assert.doesNotMatch(roomHTML(state), /id="start-room"/);
});

test('nomes de assento viajam escapados', () => {
  const room = {
    code: 'ABCDE',
    hostId: 'host',
    status: 'lobby',
    seats: [seat('host', { name: '<img src=x onerror=alert(1)>' })],
  };
  const html = roomHTML({ ...baseState, screen: 'room', online: true, myId: 'host', room });
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
});

test('overlay distingue primeira conexão de reconexão', () => {
  const connecting = connectionUIHTML({ ...baseState, connection: 'connecting' });
  assert.match(connecting, /Conectando à sala/);

  const reconnecting = connectionUIHTML({
    ...baseState,
    connection: 'reconnecting',
    room: { code: 'ABCDE', seats: [] },
  });
  assert.match(reconnecting, /Sua cadeira está reservada/);
});

test('continuidade da partida cobre eleição e nome do candidato escapado', () => {
  const html = connectionUIHTML({
    ...baseState,
    connection: 'connected',
    hostIssue: { status: 'waiting', candidateName: '<b>Bia</b>' },
  });
  assert.match(html, /Anfitrião desconectado/);
  assert.match(html, /&lt;b&gt;Bia&lt;\/b&gt;/);
});

test('falha de confirmação da jogada aparece sem aceitar HTML', () => {
  const html = connectionUIHTML({
    ...baseState,
    connection: 'connected',
    commandError: 'Jogada <b>não confirmada</b>',
  });
  assert.match(html, /Jogada &lt;b&gt;não confirmada&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>não confirmada<\/b>/);
});

test('salão alterna os campos conforme o modo e mostra erros', () => {
  assert.doesNotMatch(lobbyHTML(baseState), /id="room-code"/);
  const joining = lobbyHTML({ ...baseState, mode: 'join', joinCode: 'DM9HH', error: 'Sala não encontrada.' });
  assert.match(joining, /id="room-code"/);
  assert.match(joining, /value="DM9HH"/);
  assert.match(joining, /Sala não encontrada\./);
});

test('chat some fora do online e limita o contador de não lidas', () => {
  assert.equal(chatToggleHTML(baseState), '');
  assert.equal(chatPanelHTML(baseState), '');
  const html = chatToggleHTML({ ...baseState, online: true, chatUnread: 250 });
  assert.match(html, /<b>99<\/b>/);
});

test('escapeHTML neutraliza os cinco metacaracteres', () => {
  assert.equal(escapeHTML(`<a href="x" title='y'>&`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;');
});
