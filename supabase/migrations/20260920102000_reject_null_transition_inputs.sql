-- SQL three-valued logic would otherwise allow a NULL transition token to
-- bypass `not in`. Keep the authoritative milestone function fail-closed.
create or replace function public.confirm_chatbot(
  p_id uuid,
  p_step text,
  p_generation integer,
  p_version integer
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  e public.events;
  p public.participants;
  c public.chatbot_submissions;
  old jsonb;
  t timestamptz;
begin
  if p_id is null or p_step is null or p_generation is null or p_version is null
     or p_step not in ('deploy','verify') then
    raise exception 'INVALID_TRANSITION';
  end if;

  select * into e from public.events for share;
  if e.generation<>p_generation then raise exception 'STALE_GENERATION'; end if;

  select * into p
    from public.participants
   where user_id=auth.uid() and event_id=e.id and generation=e.generation
   for update;
  if p.id is null or not private.is_current_participant(p.id) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  select * into c
    from public.chatbot_submissions
   where id=p_id and participant_id=p.id and deleted_at is null
   for update;
  if c.id is null then raise exception 'NOT_FOUND'; end if;

  -- A retry after a committed response loss returns the original record and
  -- never creates another timestamp or audit entry.
  if (p_step='deploy' and c.deployed_at is not null)
     or (p_step='verify' and c.verified_at is not null) then
    return to_jsonb(c);
  end if;

  if c.version<>p_version then raise exception 'STALE_VERSION'; end if;
  t:=clock_timestamp();
  perform private.assert_live(e);
  if p_step='verify' and c.deployed_at is null then raise exception 'DEPLOY_FIRST'; end if;

  old:=to_jsonb(c);
  update public.chatbot_submissions
     set deployed_at=case when p_step='deploy' then t else deployed_at end,
         verified_at=case when p_step='verify' then t else verified_at end,
         updated_at=t,
         version=version+1
   where id=c.id
   returning * into c;

  perform private.audit(
    case when p_step='deploy' then 'deployment_confirmed' else 'verification_confirmed' end,
    'chatbot',c.id::text,old,to_jsonb(c),null,p_id
  );
  return to_jsonb(c);
end
$$;

revoke all on function public.confirm_chatbot(uuid,text,integer,integer)
  from public,anon;
grant execute on function public.confirm_chatbot(uuid,text,integer,integer)
  to authenticated;
