
create type public.app_role as enum ('admin', 'area_manager', 'branch');

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name_ar text not null,
  name_en text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant all on public.branches to service_role;
alter table public.branches enable row level security;

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  role public.app_role not null,
  branch_id uuid references public.branches(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
grant all on public.accounts to service_role;
alter table public.accounts enable row level security;

create table public.sessions (
  token text primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '90 days'),
  created_at timestamptz not null default now()
);
grant all on public.sessions to service_role;
alter table public.sessions enable row level security;

create table public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  entry_date date not null,
  evm3_units int not null default 0,
  cheese_units int not null default 0,
  submitted_by uuid references public.accounts(id) on delete set null,
  submitted_at timestamptz not null default now(),
  unique (branch_id, entry_date)
);
grant all on public.daily_entries to service_role;
alter table public.daily_entries enable row level security;
create index on public.daily_entries (entry_date);

create table public.report_settings (
  id int primary key default 1,
  ar_format jsonb not null default '{}'::jsonb,
  en_format jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint singleton check (id = 1)
);
grant all on public.report_settings to service_role;
alter table public.report_settings enable row level security;

-- Seed branches (user provided Event 3440067, Waziriah 3440068; other codes are placeholders admin will edit)
insert into public.branches (code, name_ar, name_en, sort_order) values
  ('3440067', 'إيفينت', 'EVENT', 1),
  ('3440062', 'القرينية', 'QURANIYA', 2),
  ('3440063', 'السنابل', 'SANABEL', 3),
  ('3440064', 'فيفكو', 'FIFCO', 4),
  ('3440065', 'الاجاويد', 'AJAWEED', 5),
  ('3440068', 'الوزيرية', 'WAZIRIAH', 6);

-- Seed admin + area manager
insert into public.accounts (code, role, display_name) values
  ('3440000', 'admin', 'Main Admin'),
  ('3440001', 'area_manager', 'Ahmed Ayash');

-- Seed one account per branch (same code as the branch)
insert into public.accounts (code, role, branch_id, display_name)
select code, 'branch'::public.app_role, id, name_en from public.branches;

-- Seed default report settings
insert into public.report_settings (id, ar_format, en_format) values (
  1,
  jsonb_build_object(
    'title_ar', 'ترتيب المطاعم ليوم',
    'large_meal_label', 'وجبة كبير',
    'cheese_label', 'الجبنة',
    'best_evm3_label', 'الوجبة الكبير',
    'best_cheese_label', 'الجبنة',
    'positions', jsonb_build_array(
      jsonb_build_object('name','المركز الأول','emoji','🥇'),
      jsonb_build_object('name','المركز الثاني','emoji','🥈'),
      jsonb_build_object('name','المركز الثالث','emoji','🥉'),
      jsonb_build_object('name','المركز الرابع','emoji','⏳'),
      jsonb_build_object('name','المركز الخامس','emoji','⏳'),
      jsonb_build_object('name','المركز الاخير','emoji','⏳')
    ),
    'arrow', '👉',
    'spaces_before_arrow', 1,
    'spaces_after_arrow', 1,
    'header_emojis', '🍔',
    'cheese_emojis', '🧀🧀 الجبنة 🧀🧀',
    'meal_emojis', '🥤 🍟 وجبة كبير 🍟🥤'
  ),
  jsonb_build_object(
    'greeting', 'Hi everyone,',
    'intro', 'I just want to share the best performance for',
    'best_evm3_label', 'EVM3 for',
    'best_cheese_label', 'Cheese for',
    'closing', 'Great work from this restaurant 👏',
    'meal_header', '🥤 🍟 Large meal 🍟🥤',
    'cheese_header', '🧀🧀 Cheese 🧀🧀',
    'positions', jsonb_build_array(
      jsonb_build_object('name','First','emoji','🥇'),
      jsonb_build_object('name','Second','emoji','🥈'),
      jsonb_build_object('name','Third','emoji','🥉'),
      jsonb_build_object('name','Fourth','emoji','⏳'),
      jsonb_build_object('name','Fifth','emoji','⏳'),
      jsonb_build_object('name','Last','emoji','⏳')
    ),
    'arrow', '👉',
    'spaces_before_arrow', 1,
    'spaces_after_arrow', 1
  )
);
