import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_COOLDOWN_MS,
  CHAT_MAX_LENGTH,
  appendChatMessage,
  createChatGuard,
  normalizeChatText,
} from '../src/rooms/chat.js';

test('normaliza controles, espaços e limita por caracteres Unicode', () => {
  assert.equal(normalizeChatText('  olá\n\n corte\u0000  '), 'olá corte');
  assert.equal(Array.from(normalizeChatText('♛'.repeat(CHAT_MAX_LENGTH + 10))).length, CHAT_MAX_LENGTH);
});

test('aplica cooldown na sexta mensagem dentro de oito segundos', () => {
  const guard = createChatGuard();
  for (let index = 0; index < 5; index++) assert.equal(guard.accept('ana', `mensagem ${index}`, index * 100).ok, true);
  const blocked = guard.accept('ana', 'sexta', 700);
  assert.deepEqual(blocked, { ok: false, reason: 'cooldown', retryAfter: CHAT_COOLDOWN_MS });
  assert.equal(guard.accept('ana', 'ainda bloqueada', 700 + CHAT_COOLDOWN_MS - 1).ok, false);
  assert.equal(guard.accept('ana', 'voltou', 700 + CHAT_COOLDOWN_MS).ok, true);
});

test('histórico rejeita vazios e duplicados e mantém as mensagens normalizadas', () => {
  const first = appendChatMessage([], { id: '1', playerId: 'ana', text: '  olá   mesa ', sentAt: 10 });
  assert.equal(first[0].text, 'olá mesa');
  assert.equal(appendChatMessage(first, first[0]), first);
  assert.equal(appendChatMessage(first, { id: '2', playerId: 'bia', text: '   ' }), first);
});

test('histórico mantém apenas as cinquenta mensagens mais recentes', () => {
  let messages = [];
  for (let index = 0; index < 55; index++) {
    messages = appendChatMessage(messages, { id: String(index), playerId: 'ana', text: `mensagem ${index}` });
  }
  assert.equal(messages.length, 50);
  assert.equal(messages[0].id, '5');
  assert.equal(messages.at(-1).id, '54');
});
