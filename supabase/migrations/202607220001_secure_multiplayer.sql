-- Identidade autoritativa para salas de La Corte.
-- A cadeira é sempre auth.uid(); IDs enviados pelo navegador são substituídos
-- dentro de broadcast_coup_room_event antes de chegar ao Realtime.

create table if not exists public.coup_rooms (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{5}$'),
  host_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 hours')
);

create table if not exists public.coup_room_members (
  room_code text not null references public.coup_rooms (code) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  player_name text not null check (
    char_length(player_name) between 1 and 18
    and player_name !~ '[[:cntrl:]]'
  ),
  joined_at timestamptz not null default now(),
  primary key (room_code, user_id)
);

create table if not exists public.coup_room_connections (
  room_code text not null,
  user_id uuid not null,
  connection_id uuid not null,
  encryption_public_key jsonb not null,
  registered_at timestamptz not null default now(),
  primary key (room_code, connection_id),
  foreign key (room_code, user_id)
    references public.coup_room_members (room_code, user_id)
    on delete cascade,
  check (
    encryption_public_key ->> 'kty' = 'EC'
    and encryption_public_key ->> 'crv' = 'P-256'
    and char_length(encryption_public_key ->> 'x') = 43
    and char_length(encryption_public_key ->> 'y') = 43
  )
);

alter table public.coup_rooms enable row level security;
alter table public.coup_room_members enable row level security;
alter table public.coup_room_connections enable row level security;

revoke all on public.coup_rooms from anon, authenticated;
revoke all on public.coup_room_members from anon, authenticated;
revoke all on public.coup_room_connections from anon, authenticated;
grant select on public.coup_room_members to authenticated;
grant select on public.coup_room_connections to authenticated;

create or replace function public.create_coup_room(p_code text, p_player_name text)
returns table (room_code text, host_user_id uuid, player_name text, is_host boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if p_code !~ '^[A-HJ-NP-Z2-9]{5}$' then
    raise exception 'INVALID_ROOM_CODE' using errcode = '22023';
  end if;
  if char_length(trim(p_player_name)) not between 1 and 18 or p_player_name ~ '[[:cntrl:]]' then
    raise exception 'INVALID_PLAYER_NAME' using errcode = '22023';
  end if;

  delete from public.coup_rooms where code = p_code and expires_at <= now();
  insert into public.coup_rooms (code, host_user_id) values (p_code, caller_id);
  insert into public.coup_room_members (room_code, user_id, player_name)
  values (p_code, caller_id, p_player_name);

  return query select p_code, caller_id, p_player_name, true;
end;
$$;

create or replace function public.join_coup_room(p_code text, p_player_name text)
returns table (room_code text, host_user_id uuid, player_name text, is_host boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  room_host_id uuid;
  canonical_name text;
begin
  if caller_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if p_code !~ '^[A-HJ-NP-Z2-9]{5}$' then
    raise exception 'INVALID_ROOM_CODE' using errcode = '22023';
  end if;
  if char_length(trim(p_player_name)) not between 1 and 18 or p_player_name ~ '[[:cntrl:]]' then
    raise exception 'INVALID_PLAYER_NAME' using errcode = '22023';
  end if;

  select room.host_user_id into room_host_id
  from public.coup_rooms as room
  where room.code = p_code and room.expires_at > now()
  for update;
  if room_host_id is null then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002';
  end if;

  select m.player_name into canonical_name
  from public.coup_room_members as m
  where m.room_code = p_code and m.user_id = caller_id;

  if canonical_name is null then
    if (select count(*) from public.coup_room_members as member where member.room_code = p_code) >= 6 then
      raise exception 'ROOM_FULL' using errcode = 'P0001';
    end if;
    insert into public.coup_room_members (room_code, user_id, player_name)
    values (p_code, caller_id, p_player_name);
    canonical_name := p_player_name;
  end if;

  return query select p_code, room_host_id, canonical_name, caller_id = room_host_id;
end;
$$;

create or replace function public.register_coup_room_connection(
  p_code text,
  p_connection_id uuid,
  p_encryption_public_key jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.coup_room_members
    where room_code = p_code and user_id = caller_id
  ) then
    raise exception 'ROOM_MEMBERSHIP_REQUIRED' using errcode = '42501';
  end if;

  delete from public.coup_room_connections
  where room_code = p_code and registered_at < now() - interval '6 hours';
  insert into public.coup_room_connections (
    room_code,
    user_id,
    connection_id,
    encryption_public_key
  ) values (
    p_code,
    caller_id,
    p_connection_id,
    p_encryption_public_key
  )
  on conflict (room_code, connection_id) do update
  set encryption_public_key = excluded.encryption_public_key,
      registered_at = now()
  where public.coup_room_connections.user_id = caller_id;
  if not found then
    raise exception 'CONNECTION_ID_ALREADY_BOUND' using errcode = '23505';
  end if;
end;
$$;

create or replace function public.broadcast_coup_room_event(
  p_code text,
  p_connection_id uuid,
  p_event text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  authenticated_payload jsonb;
begin
  if caller_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if p_event <> all (array[
    'join_request', 'room', 'host_changed', 'game_started', 'game_state',
    'command', 'chat_request', 'chat_message', 'chat_history', 'chat_rejected',
    'tabletop_reaction', 'handover_request', 'handover_response'
  ]) then
    raise exception 'INVALID_ROOM_EVENT' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'INVALID_ROOM_PAYLOAD' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.coup_room_connections
    where room_code = p_code
      and user_id = caller_id
      and connection_id = p_connection_id
  ) then
    raise exception 'CONNECTION_NOT_BOUND' using errcode = '42501';
  end if;

  authenticated_payload := p_payload
    - 'senderId'
    - 'senderConnectionId'
    || jsonb_build_object(
      'senderId', caller_id,
      'senderConnectionId', p_connection_id
    );

  -- Eventos autoritativos normais só podem partir do host registrado. A
  -- promoção é a exceção: os clientes ainda validam a eleição determinística
  -- pela Presence, e o banco persiste o vencedor para entradas posteriores.
  if p_event in ('room', 'game_started', 'game_state', 'chat_message', 'chat_history', 'chat_rejected')
    and not exists (
      select 1 from public.coup_rooms
      where code = p_code and host_user_id = caller_id and expires_at > now()
    ) then
    raise exception 'ROOM_HOST_REQUIRED' using errcode = '42501';
  end if;

  if p_event = 'join_request' then
    authenticated_payload := authenticated_payload - 'id' || jsonb_build_object('id', caller_id);
  elsif p_event = 'command' then
    authenticated_payload := authenticated_payload - 'playerId' || jsonb_build_object('playerId', caller_id);
  elsif p_event = 'tabletop_reaction' then
    authenticated_payload := authenticated_payload - 'playerId' || jsonb_build_object('playerId', caller_id);
  elsif p_event = 'handover_request' then
    authenticated_payload := authenticated_payload - 'successorId' || jsonb_build_object('successorId', caller_id);
  elsif p_event = 'handover_response' then
    authenticated_payload := authenticated_payload - 'playerId' || jsonb_build_object('playerId', caller_id);
  end if;

  if p_event = 'host_changed' then
    if authenticated_payload #>> '{room,hostId}' <> caller_id::text then
      raise exception 'INVALID_HOST_CHANGE' using errcode = '42501';
    end if;
    update public.coup_rooms
    set host_user_id = caller_id
    where code = p_code and expires_at > now();
    if not found then
      raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  -- A política de INSERT libera Broadcast somente dentro desta transação.
  -- set_config(..., true) é local e não concede permissão ao WebSocket do cliente.
  perform set_config('app.coup_server_broadcast', caller_id::text, true);
  perform realtime.send(
    authenticated_payload,
    p_event,
    'la-corte:' || p_code,
    true
  );
end;
$$;

revoke all on function public.create_coup_room(text, text) from public;
revoke all on function public.join_coup_room(text, text) from public;
revoke all on function public.register_coup_room_connection(text, uuid, jsonb) from public;
revoke all on function public.broadcast_coup_room_event(text, uuid, text, jsonb) from public;
grant execute on function public.create_coup_room(text, text) to authenticated;
grant execute on function public.join_coup_room(text, text) to authenticated;
grant execute on function public.register_coup_room_connection(text, uuid, jsonb) to authenticated;
grant execute on function public.broadcast_coup_room_event(text, uuid, text, jsonb) to authenticated;

create policy "members can read their own room memberships"
on public.coup_room_members
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "room members can read bound connections"
on public.coup_room_connections
for select
to authenticated
using (
  exists (
    select 1 from public.coup_room_members as membership
    where membership.room_code = coup_room_connections.room_code
      and membership.user_id = (select auth.uid())
  )
);

create policy "room members can receive private realtime"
on realtime.messages
for select
to authenticated
using (
  exists (
    select 1 from public.coup_room_members as membership
    where membership.user_id = (select auth.uid())
      and ('la-corte:' || membership.room_code) = (select realtime.topic())
      and realtime.messages.extension in ('broadcast', 'presence')
  )
);

-- Broadcast de clientes é proibido. A extensão broadcast só passa quando a
-- RPC marca a própria transação; o cliente pode escrever Presence direto.
create policy "room members can publish presence or rpc broadcast"
on realtime.messages
for insert
to authenticated
with check (
  exists (
    select 1 from public.coup_room_members as membership
    where membership.user_id = (select auth.uid())
      and (
        (
          realtime.messages.extension = 'presence'
          and ('la-corte:' || membership.room_code) = (select realtime.topic())
        )
        or (
          realtime.messages.extension = 'broadcast'
          and current_setting('app.coup_server_broadcast', true) = (select auth.uid())::text
          and realtime.messages.topic = 'la-corte:' || membership.room_code
        )
      )
  )
);
