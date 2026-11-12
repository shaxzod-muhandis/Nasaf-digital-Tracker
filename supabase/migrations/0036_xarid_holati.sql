-- ═══════════════════════════════════════════════════════════════════
-- NSHOP XARID HOLATI (desktop dizayn D06/D07/D28, 2026-11-12)
--
-- MUAMMO. Xarid bir lahzada yakunlanardi: Ncoin yechilib, qoldiq 1 ga
-- kamayardi va shu bilan iz yo'qolardi. Admin mahsulotni kimga
-- berganini, kimga hali bermaganini hech qayerdan ko'ra olmasdi;
-- xodim esa sovg'asini qachon olishini bilmasdi.
--
-- YECHIM. Har xarid alohida yozuv va holat:
--   pending   — Kutilmoqda (admin hali topshirmagan)
--   delivered — Topshirildi (kim va qachon yoziladi)
--   cancelled — Bekor qilindi: Ncoin `purchase_refund` bilan qaytadi,
--               qoldiq +1 (faqat admin; xodim o'zi bekor qila olmaydi)
-- Ncoin tranzaksiyalari avvalgidek balansning yagona manbai — bu jadval
-- faqat holatni saqlaydi.
--
-- ESKI XARIDLAR. Shu migratsiyagacha bo'lgan xaridlar «Topshirildi»
-- deb ko'chiriladi: ular allaqachon qo'lga berilgan deb hisoblanadi,
-- aks holda admin «Kutilmoqda»da o'nlab eski yozuvni ko'rardi.
-- Qayta ishga tushirishga chidamli (tx_id bo'yicha takrorlanmaydi).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists ncoin_purchases (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  product_id    uuid references ncoin_products(id) on delete set null,
  -- Narx va nom xarid paytidagisi: mahsulot keyin o'zgarsa ham eski
  -- xarid eski narxda qoladi (D28).
  product_name  text not null,
  price         numeric(8,1) not null,
  status        text not null default 'pending'
                check (status in ('pending', 'delivered', 'cancelled')),
  created_at    timestamptz not null default now(),
  delivered_at  timestamptz,
  delivered_by  uuid references users(id) on delete set null,
  cancelled_at  timestamptz,
  cancelled_by  uuid references users(id) on delete set null,
  cancel_reason text,
  tx_id         uuid references ncoin_transactions(id) on delete set null
);

create index if not exists idx_ncoin_purchases_status on ncoin_purchases (status, created_at desc);
create index if not exists idx_ncoin_purchases_user on ncoin_purchases (user_id, created_at desc);
create unique index if not exists uq_ncoin_purchases_tx on ncoin_purchases (tx_id) where tx_id is not null;

alter table ncoin_purchases enable row level security;

insert into ncoin_purchases (user_id, product_id, product_name, price, status, created_at, delivered_at, tx_id)
select t.user_id,
       p.id,
       coalesce(p.name, 'Mahsulot'),
       -t.amount,
       'delivered',
       t.created_at,
       t.created_at,
       t.id
  from ncoin_transactions t
  left join ncoin_products p on p.id::text = t.reference_id
 where t.reason = 'purchase'
   and t.reference_type = 'product'
   and not exists (select 1 from ncoin_purchases x where x.tx_id = t.id);
