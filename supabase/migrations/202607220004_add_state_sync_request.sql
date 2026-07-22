-- Adiciona recuperação de estado e ACK de jogadas aos Broadcasts autenticados.
-- O remetente continua derivado de auth.uid().

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
    'state_sync_request', 'command', 'command_ack', 'chat_request', 'chat_message', 'chat_history',
    'chat_rejected', 'tabletop_reaction', 'handover_request', 'handover_response'
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

  if p_event in ('room', 'game_started', 'game_state', 'command_ack', 'chat_message', 'chat_history', 'chat_rejected')
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

  perform set_config('app.coup_server_broadcast', caller_id::text, true);
  perform realtime.send(
    authenticated_payload,
    p_event,
    'la-corte:' || p_code,
    true
  );
end;
$$;

revoke all on function public.broadcast_coup_room_event(text, uuid, text, jsonb) from public;
grant execute on function public.broadcast_coup_room_event(text, uuid, text, jsonb) to authenticated;
