import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authenticatedUser,
  authorizeRoomSeat,
  broadcastRoomEvent,
  registerRoomConnection,
  roomConnectionRegistry,
} from '../src/rooms/auth.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const HOST_ID = '22222222-2222-4222-8222-222222222222';
const CONNECTION_ID = '33333333-3333-4333-8333-333333333333';

test('reutiliza a sessão Auth existente e só cria usuário anônimo quando necessário', async () => {
  let anonymousCalls = 0;
  let realtimeAuthCalls = 0;
  const existing = {
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
      signInAnonymously: async () => {
        anonymousCalls += 1;
        return { data: { user: { id: USER_ID } }, error: null };
      },
    },
    realtime: {
      setAuth: async () => {
        realtimeAuthCalls += 1;
      },
    },
  };
  assert.equal((await authenticatedUser(existing)).id, USER_ID);
  assert.equal(anonymousCalls, 0);
  assert.equal(realtimeAuthCalls, 1);

  const anonymous = {
    auth: {
      getUser: async () => ({ data: { user: null }, error: { message: 'missing' } }),
      signInAnonymously: async () => ({ data: { user: { id: USER_ID } }, error: null }),
    },
    realtime: { setAuth: async () => {} },
  };
  assert.equal((await authenticatedUser(anonymous)).id, USER_ID);
});

test('cria a cadeira com auth.uid e tenta outro código quando há colisão', async () => {
  const calls = [];
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
      signInAnonymously: async () => ({ data: {}, error: null }),
    },
    realtime: { setAuth: async () => {} },
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (args.p_code === 'ABCDE') return { data: null, error: { code: '23505', message: 'duplicate key' } };
      return {
        data: [{ room_code: 'FGHJK', host_user_id: USER_ID, player_name: 'Ana', is_host: true }],
        error: null,
      };
    },
  };
  const codes = ['ABCDE', 'FGHJK'];
  const access = await authorizeRoomSeat(client, {
    kind: 'create',
    name: 'Ana',
    generateCode: () => codes.shift(),
  });
  assert.deepEqual(access, {
    userId: USER_ID,
    code: 'FGHJK',
    hostId: USER_ID,
    name: 'Ana',
    isHost: true,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], 'create_coup_room');
});

test('entra pela RPC e traduz erros de sala sem expor detalhes do banco', async () => {
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
      signInAnonymously: async () => ({ data: {}, error: null }),
    },
    realtime: { setAuth: async () => {} },
    rpc: async () => ({ data: null, error: { code: 'P0002', message: 'ROOM_NOT_FOUND' } }),
  };
  await assert.rejects(authorizeRoomSeat(client, { kind: 'join', code: 'ABCDE', name: 'Bia' }), /Sala não encontrada/);
});

test('registra a conexão, lê somente o registro da sala e envia por RPC', async () => {
  const rpcCalls = [];
  const rows = [
    {
      room_code: 'ABCDE',
      user_id: HOST_ID,
      connection_id: CONNECTION_ID,
      encryption_public_key: { kty: 'EC' },
    },
  ];
  const query = {
    select(columns) {
      assert.equal(columns, 'room_code,user_id,connection_id,encryption_public_key');
      return this;
    },
    async eq(column, value) {
      assert.equal(column, 'room_code');
      assert.equal(value, 'ABCDE');
      return { data: rows, error: null };
    },
  };
  const client = {
    rpc: async (name, args) => {
      rpcCalls.push([name, args]);
      return { error: null };
    },
    from(table) {
      assert.equal(table, 'coup_room_connections');
      return query;
    },
  };

  await registerRoomConnection(client, {
    code: 'ABCDE',
    connectionId: CONNECTION_ID,
    publicKey: { kty: 'EC' },
  });
  const registry = await roomConnectionRegistry(client, 'ABCDE');
  assert.equal(registry.get(CONNECTION_ID).user_id, HOST_ID);
  assert.equal(
    await broadcastRoomEvent(client, {
      code: 'ABCDE',
      connectionId: CONNECTION_ID,
      event: 'command',
      payload: { playerId: 'forjado' },
    }),
    'ok',
  );
  assert.deepEqual(
    rpcCalls.map(([name]) => name),
    ['register_coup_room_connection', 'broadcast_coup_room_event'],
  );
});
