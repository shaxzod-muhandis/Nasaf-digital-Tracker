-- ═══════════════════════════════════════════════════════════════════
-- NSHOP TOIFASI (mobil dizayn 07, 2026-11-14)
--
-- Dizaynda NShop ro'yxati tepasida toifa chiplari bor (Hammasi,
-- Gadjet, Kiyim, Sertifikat). Egasi toifa qo'shishni tanladi.
--
-- Erkin matn, alohida jadval emas: toifalar soni oz, admin mahsulot
-- formasida yozadi yoki mavjudlaridan tanlaydi. Bo'sh — toifasiz
-- (faqat "Hammasi" ichida ko'rinadi). Ncoin narxi va xarid jarayoniga
-- aloqasi yo'q — faqat ko'rsatish uchun.
-- ═══════════════════════════════════════════════════════════════════

alter table ncoin_products add column if not exists category text
  check (category is null or char_length(category) between 1 and 40);
