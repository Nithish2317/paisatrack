-- PaisaTrack v1 schema for Supabase PostgreSQL.
-- Run this entire file in Supabase SQL Editor on a NEW project.
-- Review before applying to an existing database.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  currency char(3) not null default 'INR',
  timezone text not null default 'Asia/Kolkata',
  date_format text not null default 'DD/MM/YYYY',
  theme text not null default 'dark' check (theme in ('light','dark','system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_name text not null check (char_length(account_name) between 2 and 60),
  account_type text not null check (account_type in ('cash','bank','savings')),
  opening_balance numeric(14,2) not null default 0,
  currency char(3) not null default 'INR',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(id,user_id)
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  type text not null check (type in ('income','expense')),
  icon text,
  color text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists categories_user_name_type_unique
on public.categories (coalesce(user_id,'00000000-0000-0000-0000-000000000000'::uuid), lower(name), type);

insert into public.categories (user_id,name,type) values
(null,'Salary','income'),(null,'Freelance','income'),(null,'Bonus','income'),(null,'Refund','income'),(null,'Other income','income'),
(null,'Food & Groceries','expense'),(null,'Rent','expense'),(null,'Family','expense'),(null,'Transport / Petrol','expense'),
(null,'Shopping','expense'),(null,'Health','expense'),(null,'Gym & Fitness','expense'),(null,'Subscriptions','expense'),
(null,'Mobile & Internet','expense'),(null,'Entertainment','expense'),(null,'EMI Interest','expense'),(null,'Personal Care','expense'),(null,'Other expense','expense')
on conflict do nothing;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('income','expense')),
  title text not null check (char_length(title) between 2 and 60),
  amount numeric(14,2) not null check (amount > 0),
  currency char(3) not null default 'INR',
  category_id uuid not null references public.categories(id),
  account_id uuid,
  transaction_date date not null,
  payment_method text not null check (payment_method in ('cash','upi','debit_card','credit_card','bank_transfer','net_banking','other')),
  notes text check (notes is null or char_length(notes) <= 500),
  status text not null default 'posted' check (status in ('pending','posted','cancelled')),
  idempotency_key uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id,user_id) references public.accounts(id,user_id),
  unique(user_id,idempotency_key)
);

create index if not exists transactions_user_date_idx on public.transactions(user_id,transaction_date desc) where deleted_at is null;
create index if not exists transactions_user_category_idx on public.transactions(user_id,category_id);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id),
  period_month date not null check (extract(day from period_month)=1),
  budget_amount numeric(14,2) not null check (budget_amount > 0),
  alert_threshold integer not null default 75 check (alert_threshold between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists budgets_user_month_category_unique
on public.budgets(user_id,period_month,coalesce(category_id,'00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_name text not null check (char_length(goal_name) between 2 and 80),
  target_amount numeric(14,2) not null check (target_amount > 0),
  target_date date,
  status text not null default 'active' check (status in ('active','completed','paused','cancelled')),
  created_at timestamptz not null default now()
);
create table if not exists public.savings_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  contribution_date date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  foreign key(goal_id,user_id) references public.savings_goals(id,user_id)
);

create table if not exists public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_name text not null,
  issuer text,
  last_four char(4),
  credit_limit numeric(14,2) not null check (credit_limit > 0),
  statement_day smallint check (statement_day between 1 and 31),
  due_day smallint check (due_day between 1 and 31),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.card_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null,
  title text not null,
  amount numeric(14,2) not null check (amount > 0),
  transaction_date date not null,
  transaction_type text not null check (transaction_type in ('purchase','refund','payment')),
  linked_transaction_id uuid references public.transactions(id),
  created_at timestamptz not null default now(),
  foreign key(card_id,user_id) references public.credit_cards(id,user_id)
);

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  loan_name text not null,
  lender text,
  principal_amount numeric(14,2) not null check (principal_amount > 0),
  interest_rate numeric(7,4) not null default 0 check (interest_rate >= 0 and interest_rate <= 100),
  interest_method text not null default 'reducing' check (interest_method in ('reducing','flat','manual')),
  tenure_months integer not null check (tenure_months > 0),
  emi_amount numeric(14,2) not null check (emi_amount > 0),
  start_date date not null,
  first_due_date date not null,
  outstanding_principal numeric(14,2) not null check (outstanding_principal >= 0),
  status text not null default 'active' check (status in ('active','closed','paused')),
  created_at timestamptz not null default now()
);

create table if not exists public.emi_installments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  loan_id uuid not null,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  principal_component numeric(14,2) not null default 0 check (principal_component >= 0),
  interest_component numeric(14,2) not null default 0 check (interest_component >= 0),
  total_due numeric(14,2) not null check (total_due > 0),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  paid_date date,
  status text not null default 'upcoming' check (status in ('upcoming','partial','paid','overdue','skipped')),
  created_at timestamptz not null default now(),
  foreign key(loan_id,user_id) references public.loans(id,user_id),
  unique(loan_id,installment_number)
);

create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  amount numeric(14,2) not null check (amount > 0),
  transaction_type text not null check (transaction_type in ('income','expense')),
  category_id uuid not null references public.categories(id),
  frequency text not null check (frequency in ('daily','weekly','monthly','quarterly','yearly','custom')),
  interval_value integer not null default 1 check (interval_value > 0),
  start_date date not null,
  end_date date,
  next_occurrence date not null,
  payment_method text not null default 'upi',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table if not exists public.recurring_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_id uuid not null references public.recurring_rules(id) on delete cascade,
  occurrence_date date not null,
  transaction_id uuid references public.transactions(id),
  status text not null default 'generated' check (status in ('generated','skipped','cancelled')),
  created_at timestamptz not null default now(),
  unique(rule_id,occurrence_date)
);

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_type text not null check (file_type in ('csv','xlsx')),
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  status text not null default 'pending' check (status in ('pending','validated','completed','failed')),
  created_at timestamptz not null default now()
);
create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  row_number integer not null,
  raw_data jsonb not null,
  validation_error text,
  imported_transaction_id uuid references public.transactions(id),
  created_at timestamptz not null default now(),
  unique(import_job_id,row_number)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

-- User ownership policies. Category reads allow global system categories or own categories.
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.savings_goals enable row level security;
alter table public.savings_contributions enable row level security;
alter table public.credit_cards enable row level security;
alter table public.card_transactions enable row level security;
alter table public.loans enable row level security;
alter table public.emi_installments enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.recurring_occurrences enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_rows enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

create policy "profile own select" on public.profiles for select using (id=auth.uid());
create policy "profile own update" on public.profiles for update using (id=auth.uid()) with check (id=auth.uid());

create policy "accounts own all" on public.accounts for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "categories read system or own" on public.categories for select using (user_id is null or user_id=auth.uid());
create policy "categories own insert" on public.categories for insert with check (user_id=auth.uid());
create policy "categories own update" on public.categories for update using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "categories own delete" on public.categories for delete using (user_id=auth.uid());

create policy "transactions own all" on public.transactions for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "budgets own all" on public.budgets for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "savings goals own all" on public.savings_goals for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "savings contributions own all" on public.savings_contributions for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "cards own all" on public.credit_cards for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "card transactions own all" on public.card_transactions for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "loans own all" on public.loans for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "emi own all" on public.emi_installments for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "recurring own all" on public.recurring_rules for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "occurrences own all" on public.recurring_occurrences for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "imports own all" on public.import_jobs for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "import rows own all" on public.import_rows for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "notifications own all" on public.notifications for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "audit own select" on public.audit_logs for select using (user_id=auth.uid());
create policy "audit own insert" on public.audit_logs for insert with check (user_id=auth.uid());

-- Ensure transaction category is either a system category or owned by the same user.
create or replace function public.check_transaction_category_owner()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from public.categories c
    where c.id=new.category_id
      and (c.user_id is null or c.user_id=new.user_id)
      and c.type=new.transaction_type
  ) then
    raise exception 'Invalid category for this user or transaction type';
  end if;
  return new;
end;
$$;
drop trigger if exists transaction_category_owner on public.transactions;
create trigger transaction_category_owner before insert or update of category_id,transaction_type,user_id
on public.transactions for each row execute function public.check_transaction_category_owner();

-- Enable Realtime for transactions and budgets.
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.budgets;
