import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');

test('join_coup_room qualifica colunas que também são nomes de saída', async () => {
  for (const source of await Promise.all([
    migration('202607220001_secure_multiplayer.sql'),
    migration('202607220002_fix_join_room_host_reference.sql'),
  ])) {
    assert.match(source, /select room\.host_user_id into room_host_id/);
    assert.match(source, /member\.room_code = p_code/);
    assert.doesNotMatch(source, /select host_user_id into room_host_id/);
    assert.doesNotMatch(source, /from public\.coup_room_members where room_code = p_code/);
  }
});

test('Broadcast direto segue negado e a RPC libera somente sua transação', async () => {
  for (const source of await Promise.all([
    migration('202607220001_secure_multiplayer.sql'),
    migration('202607220003_allow_rpc_realtime_broadcast.sql'),
  ])) {
    assert.match(source, /set_config\('app\.coup_server_broadcast', caller_id::text, true\)/);
    assert.match(source, /current_setting\('app\.coup_server_broadcast', true\) = \(select auth\.uid\(\)\)::text/);
    assert.match(source, /realtime\.messages\.extension = 'presence'/);
    assert.match(source, /realtime\.messages\.extension = 'broadcast'/);
    assert.match(source, /realtime\.messages\.topic = 'la-corte:' \|\| membership\.room_code/);
  }
});

test('RPC permite pedido autenticado de recuperação do estado', async () => {
  const source = await migration('202607220004_add_state_sync_request.sql');
  assert.match(source, /'state_sync_request'/);
  assert.match(source, /connection_id = p_connection_id/);
  assert.match(source, /'senderId', caller_id/);
  const hostOnlyEvents = source.match(/if p_event in \(([^)]+)\)/)?.[1] ?? '';
  assert.doesNotMatch(hostOnlyEvents, /state_sync_request/);
  assert.match(hostOnlyEvents, /command_ack/);
});
