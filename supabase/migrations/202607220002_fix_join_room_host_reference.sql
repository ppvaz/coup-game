-- Corrige a colisão entre a coluna coup_rooms.host_user_id e a coluna de
-- saída homônima declarada por RETURNS TABLE em join_coup_room.

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

  select member.player_name into canonical_name
  from public.coup_room_members as member
  where member.room_code = p_code and member.user_id = caller_id;

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

revoke all on function public.join_coup_room(text, text) from public;
grant execute on function public.join_coup_room(text, text) to authenticated;
