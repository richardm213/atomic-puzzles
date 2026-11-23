-- Run in Firefox on the current database after puzzle_creation_great_explanation_bonus.sql.
-- Every fixture and credit rolls back; restore the puzzle sequence touched by approval.
begin;
do $$
declare
  template public.puzzles%rowtype;
  queued public.puzzles_queue%rowtype;
  first_id bigint;
  published_id bigint;
  receipt_count integer;
  ledger_before numeric;
  ledger_after numeric;
  puzzle_sequence text;
  saved_sequence bigint;
  saved_is_called boolean;
begin
  lock table public.puzzles in share row exclusive mode;
  select * into template from public.puzzles where deleted_at is null order by id limit 1;
  select coalesce(max(id),0)+1 into first_id from public.puzzles;
  puzzle_sequence := pg_get_serial_sequence('public.puzzles','id');
  if puzzle_sequence is not null then
    execute format('select last_value,is_called from %s',puzzle_sequence::regclass)
      into saved_sequence,saved_is_called;
  end if;
  begin
    select coalesce(sum(amount),0) into ledger_before from public.coin_transactions
    where username='maracker';
    queued := public.enqueue_puzzle_submission(template.fen,template.solution,'','','',
      '{}'::text[],'','','',false,'maracker',array['fork','material','draw'],'maracker');
    select coalesce(sum(amount),0) into ledger_after from public.coin_transactions
    where username='maracker';
    if ledger_after <> ledger_before then raise exception 'Queue submission paid coins before approval'; end if;

    -- Remove one creator tag and add a reviewer tag before approval.
    update public.puzzles_queue set tags=array['fork','material','tempo'],
      submitted_tags=array['fork','material','tempo'] where id=queued.id;
    begin
      perform public.approve_queued_puzzle(queued.id,'seaside_tiramisu',first_id,true,true,true);
      raise exception 'Great explanation reward accepted a submission with no explanation';
    exception when sqlstate 'PT400' then
      null;
    end;
    update public.puzzles_queue set explanation='The forcing move clears a line for the attack.'
      where id=queued.id;
    published_id := public.approve_queued_puzzle(queued.id,'seaside_tiramisu',first_id,true,true,true);
    if (select metadata->>'greatExplanationBonus' from public.coin_transactions
        where source_key='puzzle:' || published_id) is distinct from '3' then
      raise exception 'Creation ledger receipt must identify the great explanation bonus';
    end if;
    if current_setting('app.puzzle_creation_great_explanation_bonus',true) = 'true' then
      raise exception 'Great explanation selection escaped approval';
    end if;
    if (select reward from public.puzzle_submission_tag_credits where puzzle_id=published_id) <> 0.40 then
      raise exception 'Only surviving creator tags should earn approval credit';
    end if;
    if (select coin_amount from public.notifications where puzzle_id=published_id
        and notification_type='puzzle_approved' and recipient_username='maracker') is distinct from 13.40 then
      raise exception 'Approval notification must include creation and tag rewards';
    end if;
    if (select submitted_tags from public.puzzles where id=published_id)
        <> array['fork','material','draw'] then
      raise exception 'Reviewer edits overwrote the original submitted tags';
    end if;
    if exists (select 1 from public.coin_transactions where username='maracker'
        and metadata->>'puzzleId'=published_id::text and metadata->>'tag' in ('draw','tempo')) then
      raise exception 'Removed or reviewer-added tag received a reward';
    end if;
    if public.credit_puzzle_submission_tags(published_id,array['fork','material','draw']) <> 0 then
      raise exception 'Repeated approval tag credit paid twice';
    end if;
    select count(*) into receipt_count from public.coin_transactions
    where username='maracker' and reason='puzzle_tagging' and metadata->>'puzzleId'=published_id::text;
    if receipt_count <> 2 then raise exception 'Duplicate submission tag receipts'; end if;
    if (public.cast_rewarded_puzzle_tag_vote(published_id,'maracker','fork',0)->>'coinDelta')::numeric <> -0.20 then
      raise exception 'Withdrawing a submitted vote must reverse its reward';
    end if;
    if (public.cast_rewarded_puzzle_tag_vote(published_id,'maracker','fork',1)->>'coinDelta')::numeric <> 0 then
      raise exception 'Submission tags can farm a second vote reward';
    end if;

    perform set_config('app.puzzle_creation_complexity_bonus','',true);
    perform set_config('app.puzzle_creation_explanation_bonus','',true);
    published_id := (public.publish_approved_puzzle_batch(jsonb_build_array(jsonb_build_object(
      'fen',template.fen,'solution',template.solution,'tags',
      jsonb_build_array('fork','epaulette_fork','material'))),'wolfram_ep'))[1];
    if (select reward from public.puzzle_submission_tag_credits where puzzle_id=published_id) <> 0.30 then
      raise exception 'Parent and child were paid separately or visible-tag threshold changed';
    end if;
    if (select coin_amount from public.notifications where puzzle_id=published_id
        and notification_type='puzzle_approved' and recipient_username='wolfram_ep') <> 8.30 then
      raise exception 'Direct publication notification omitted the combined reward';
    end if;
    if (select count(*) from public.notifications where puzzle_id=published_id
        and notification_type='puzzle_approved') <> 1 then
      raise exception 'Publication produced duplicate notifications';
    end if;

    published_id := (public.publish_approved_puzzle_batch(jsonb_build_array(jsonb_build_object(
      'fen',template.fen,'solution',template.solution,'tags',jsonb_build_array('fork'))),
      'seaside_tiramisu'))[1];
    if (select reward from public.puzzle_submission_tag_credits where puzzle_id=published_id) <> 0.20 then
      raise exception 'Curated initial vote prevented the admin creator from receiving a submission reward';
    end if;
    if puzzle_sequence is not null then
      perform setval(puzzle_sequence::regclass,saved_sequence,saved_is_called);
    end if;
  exception when others then
    if puzzle_sequence is not null then
      perform setval(puzzle_sequence::regclass,saved_sequence,saved_is_called);
    end if;
    raise;
  end;
end;
$$;
select 'queue timing, approval bonuses, direct publication, combined notifications, hierarchy, idempotency and reversals passed' as checks;
rollback;
