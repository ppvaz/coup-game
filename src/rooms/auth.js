const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{5}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function rpcRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

function roomAccessError(error) {
  const marker = `${error?.code ?? ''} ${error?.message ?? ''}`;
  if (/ROOM_NOT_FOUND|P0002/.test(marker)) return 'Sala não encontrada ou convite expirado.';
  if (/ROOM_FULL/.test(marker)) return 'A sala está cheia.';
  if (/INVALID_PLAYER_NAME/.test(marker)) return 'Escolha um nome válido com até 18 caracteres.';
  if (/Anonymous sign-ins are disabled/i.test(marker)) return 'Ative Anonymous Sign-Ins no Supabase Auth.';
  return 'Não foi possível autorizar sua cadeira no Supabase.';
}

export async function authenticatedUser(client) {
  const current = await client.auth.getUser();
  let user = current.data?.user;
  if (current.error || !UUID_PATTERN.test(user?.id)) {
    const created = await client.auth.signInAnonymously();
    if (created.error || !UUID_PATTERN.test(created.data?.user?.id)) {
      throw new Error(roomAccessError(created.error));
    }
    user = created.data.user;
  }
  await client.realtime.setAuth();
  return user;
}

export async function authorizeRoomSeat(client, { kind, code, name, generateCode, attempts = 5 }) {
  const user = await authenticatedUser(client);
  const creating = kind === 'create';
  let roomCode = creating ? generateCode() : code;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!ROOM_CODE_PATTERN.test(roomCode)) throw new Error('Código de sala inválido.');
    const rpc = creating ? 'create_coup_room' : 'join_coup_room';
    const { data, error } = await client.rpc(rpc, { p_code: roomCode, p_player_name: name });
    if (!error) {
      const access = rpcRow(data);
      if (
        access?.room_code !== roomCode ||
        !UUID_PATTERN.test(access.host_user_id) ||
        typeof access.player_name !== 'string' ||
        typeof access.is_host !== 'boolean'
      )
        throw new Error('O Supabase devolveu uma associação de cadeira inválida.');
      return {
        userId: user.id,
        code: roomCode,
        hostId: access.host_user_id,
        name: access.player_name,
        isHost: access.is_host,
      };
    }
    if (creating && /23505|duplicate key/i.test(`${error.code ?? ''} ${error.message ?? ''}`)) {
      roomCode = generateCode();
      continue;
    }
    throw new Error(roomAccessError(error));
  }
  throw new Error('Não foi possível gerar um código de sala livre. Tente novamente.');
}

export async function registerRoomConnection(client, { code, connectionId, publicKey }) {
  const { error } = await client.rpc('register_coup_room_connection', {
    p_code: code,
    p_connection_id: connectionId,
    p_encryption_public_key: publicKey,
  });
  if (error) throw new Error('Não foi possível vincular esta conexão à cadeira autenticada.');
}

export async function roomConnectionRegistry(client, code) {
  const { data, error } = await client
    .from('coup_room_connections')
    .select('room_code,user_id,connection_id,encryption_public_key')
    .eq('room_code', code);
  if (error || !Array.isArray(data)) return null;
  return new Map(data.map((entry) => [entry.connection_id, entry]));
}

export async function broadcastRoomEvent(client, { code, connectionId, event, payload = {} }) {
  const { error } = await client.rpc('broadcast_coup_room_event', {
    p_code: code,
    p_connection_id: connectionId,
    p_event: event,
    p_payload: payload,
  });
  return error ? 'error' : 'ok';
}
