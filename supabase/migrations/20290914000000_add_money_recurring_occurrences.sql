create table if not exists public.money_recurring_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recurring_item_id uuid not null references public.money_recurring_items(id) on delete cascade,
  occurrence_date date not null,
  account_id uuid null references public.money_accounts(id) on delete restrict,
  category_id uuid null references public.money_categories(id) on delete restrict,
  name text not null,
  direction text not null check (direction in ('inflow','outflow')),
  amount_minor bigint not null check (amount_minor > 0),
  currency_code char(3) not null default 'USD'
    check (currency_code ~ '^[A-Z]{3}$'),
  status text not null default 'pending'
    check (status in ('pending','posted','void')),
  posted_transaction_id uuid null
    references public.money_transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint money_recurring_occurrences_name_not_blank
    check (length(btrim(name)) > 0),
  constraint money_recurring_occurrences_unique
    unique (user_id, recurring_item_id, occurrence_date)
);

create index if not exists money_recurring_occurrences_user_status_date_idx
  on public.money_recurring_occurrences(user_id, status, occurrence_date desc);

alter table public.money_recurring_occurrences enable row level security;

create policy "money_recurring_occurrences_select_own"
  on public.money_recurring_occurrences
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "money_recurring_occurrences_insert_own"
  on public.money_recurring_occurrences
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.money_recurring_items r
      where r.id = recurring_item_id
        and r.user_id = auth.uid()
    )
  );

create trigger money_recurring_occurrences_set_updated_at
before update on public.money_recurring_occurrences
for each row execute function public.set_updated_at();

create or replace function public.materialize_money_recurring_occurrence(
  p_recurring_item_id uuid,
  p_occurrence_date date
)
returns public.money_recurring_occurrences
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_item public.money_recurring_items;
  v_occurrence public.money_recurring_occurrences;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_item
  from public.money_recurring_items
  where id = p_recurring_item_id
    and user_id = v_user_id
    and is_active = true;

  if not found then
    raise exception 'Recurring Money item not found';
  end if;

  insert into public.money_recurring_occurrences (
    user_id,
    recurring_item_id,
    occurrence_date,
    account_id,
    category_id,
    name,
    direction,
    amount_minor,
    currency_code,
    status
  )
  values (
    v_user_id,
    v_item.id,
    p_occurrence_date,
    v_item.account_id,
    v_item.category_id,
    v_item.name,
    v_item.direction,
    v_item.amount_minor,
    v_item.currency_code,
    'pending'
  )
  on conflict (user_id, recurring_item_id, occurrence_date)
  do update set recurring_item_id = excluded.recurring_item_id
  returning * into v_occurrence;

  return v_occurrence;
end;
$$;

create or replace function public.confirm_money_recurring_occurrence(
  p_occurrence_id uuid,
  p_account_id uuid default null
)
returns public.money_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_occurrence public.money_recurring_occurrences;
  v_account_id uuid;
  v_transaction public.money_transactions;
  v_balance_delta bigint;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_occurrence
  from public.money_recurring_occurrences
  where id = p_occurrence_id
    and user_id = v_user_id
  for update;

  if not found or v_occurrence.status <> 'pending' then
    raise exception 'Pending recurring occurrence not found';
  end if;

  v_account_id := coalesce(p_account_id, v_occurrence.account_id);

  if v_account_id is null then
    raise exception 'Choose an account before confirming';
  end if;

  insert into public.money_transactions (
    user_id,
    account_id,
    category_id,
    transaction_type,
    direction,
    amount_minor,
    currency_code,
    transaction_date,
    description,
    status,
    source,
    source_ref
  )
  values (
    v_user_id,
    v_account_id,
    v_occurrence.category_id,
    case
      when v_occurrence.direction = 'inflow' then 'income'
      else 'expense'
    end,
    v_occurrence.direction,
    v_occurrence.amount_minor,
    v_occurrence.currency_code,
    v_occurrence.occurrence_date,
    v_occurrence.name,
    'posted',
    'manual',
    'recurring_occurrence:' || v_occurrence.id::text
  )
  returning * into v_transaction;

  v_balance_delta :=
    case
      when v_occurrence.direction = 'inflow'
        then v_occurrence.amount_minor
      else -v_occurrence.amount_minor
    end;

  update public.money_accounts
  set balance_minor = balance_minor + v_balance_delta
  where id = v_account_id
    and user_id = v_user_id;

  update public.money_recurring_occurrences
  set status = 'posted',
      account_id = v_account_id,
      posted_transaction_id = v_transaction.id
  where id = v_occurrence.id;

  return v_transaction;
end;
$$;

revoke all on function public.materialize_money_recurring_occurrence(uuid, date)
from public;
grant execute on function public.materialize_money_recurring_occurrence(uuid, date)
to authenticated;

revoke all on function public.confirm_money_recurring_occurrence(uuid, uuid)
from public;
grant execute on function public.confirm_money_recurring_occurrence(uuid, uuid)
to authenticated;
