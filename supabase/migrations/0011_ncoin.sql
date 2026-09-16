-- ═══════════════════════════════════════════════════════════════════════
-- Ncoin gamifikatsiya + NShop — post/stories/vazifa bajarilganda coin
-- beriladi, xodim haladilnikdagi ichimliklarga shu coin evaziga
-- almashtirishi mumkin.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists ncoin_products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  price numeric(6,1) not null default 0,
  stock integer not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now()
);

-- Balans alohida saqlanmaydi — har doim shu jadvaldan sum(amount)
-- orqali hisoblanadi (tarix bilan bir manba, moslik buzilishi mumkin
-- emas). amount: musbat = topilgan (check/task bajarilgani uchun),
-- manfiy = sarflangan (xarid) yoki qaytarilgan (bekor qilingan
-- check/task uchun avvalgi mukofotning bekor qilinishi).
create table if not exists ncoin_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  amount numeric(6,1) not null,
  reason text not null,
  reference_type text,
  reference_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ncoin_tx_user on ncoin_transactions(user_id, created_at desc);
create index if not exists idx_ncoin_tx_reference on ncoin_transactions(reference_type, reference_id);

-- 4 ta ma'lum mahsulot nomi/zaxirasi oldindan to'ldiriladi, lekin
-- narxsiz (0) va YASHIRIN — admin narxni o'zi kiritib, ko'rinadigan
-- qilguncha xodimlarga ko'rinmaydi.
insert into ncoin_products (name, price, stock, is_visible) values
  ('Fuse Tea 500 ml', 0, 24, false),
  ('Lipton 0,5 L', 0, 24, false),
  ('Vecherinka 300 ml', 0, 23, false),
  ('Enerji Moxito 500 ml', 0, 22, false)
on conflict (name) do nothing;
