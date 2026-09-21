-- ═══════════════════════════════════════════════════════════════════════
-- NShop mahsulotlariga rasm qo'yish imkoniyati — rasm Vercel Blob'da
-- saqlanadi (fayl bazada emas), bu yerda faqat uning ochiq URL'i
-- yoziladi.
-- ═══════════════════════════════════════════════════════════════════════

alter table ncoin_products add column if not exists image_url text;
