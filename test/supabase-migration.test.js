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
