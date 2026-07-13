-- ============================================================
-- shopping_items — רשימת קניות משפחתית משותפת (FamilyMealPlanner)
-- ============================================================

create table if not exists public.shopping_items (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category      text not null,
  quantity      text,
  note          text,
  is_purchased  boolean not null default false,
  -- שמור לעתיד: כשתתווסף תמיכה במשפחות (households) מרובות, כל שורה
  -- תשויך למשפחה. כרגע נשאר ריק כי יש רשימה משותפת אחת בלבד.
  household_id  uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists shopping_items_created_at_idx
  on public.shopping_items (created_at desc);

alter table public.shopping_items enable row level security;

-- ------------------------------------------------------------
-- ⚠️  אזהרה: ה-policies הבאות פתוחות לכל אחד (ללא התחברות משתמשים),
-- מתאימות אך ורק לגרסת דמו/רשימה משפחתית פשוטה אחת.
-- אסור להשתמש בתבנית הזו במערכת אמיתית עם מידע רגיש או משתמשים מרובים.
--
-- כשתתווסף מערכת household/auth, הן יוחלפו במשהו בסגנון:
--   using (household_id = (select household_id from household_members
--                           where user_id = auth.uid()))
-- ------------------------------------------------------------

create policy "public can read shopping items"
  on public.shopping_items for select
  using (true);

create policy "public can insert shopping items"
  on public.shopping_items for insert
  with check (true);

create policy "public can update shopping items"
  on public.shopping_items for update
  using (true) with check (true);

create policy "public can delete shopping items"
  on public.shopping_items for delete
  using (true);

-- מפעיל Realtime על הטבלה הזו בלבד
alter publication supabase_realtime add table public.shopping_items;
