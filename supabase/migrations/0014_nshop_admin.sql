-- ═══════════════════════════════════════════════════════════════════════
-- NShop boshqaruvi (admin panel) — qayta ishlab chiqilgan dizayn uchun
-- ikkita yangi tushuncha kerak bo'ladi:
--   stock_capacity — mahsulotning "to'liq zaxira" (oxirgi to'ldirilgan)
--     miqdori. Qoldiq progress-bar shunga nisbatan hisoblanadi (masalan
--     24/28). Yaratilganda va har safar zaxira sotilgandan KO'PROQ qilib
--     belgilansa (yaratish/tahrirlash/qoldiq qo'shish), shu songa
--     ko'tariladi — xarid qilinganda esa faqat `stock` kamayadi, bar
--     shunga qarab pasayadi.
--   is_archived — "arxivlangan" mahsulot: admin ro'yxatidan yashiriladi
--     (o'chirilmaydi, tarixi saqlanadi), `is_visible=false` bilan bir xil
--     emas (u faqat NShopdan yashiradi, admin panelda ko'rinaveradi).
-- ═══════════════════════════════════════════════════════════════════════

alter table ncoin_products add column if not exists stock_capacity integer not null default 0;
update ncoin_products set stock_capacity = stock where stock_capacity = 0 and stock > 0;
alter table ncoin_products add column if not exists is_archived boolean not null default false;
