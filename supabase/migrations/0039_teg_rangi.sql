-- ═══════════════════════════════════════════════════════════════════
-- TEG RANGI (D05, 2026-11-12)
--
-- Teg rangi avval faqat kodda hisoblanardi (asosiy teglar qat'iy
-- biriktirilgan, qolgani nomidan xesh). Admin rangni o'zgartira
-- olmasdi, yangi teg esa tasodifiy rang olardi. Endi admin tanlaydi.
--
-- Qiymat — ilova palitrasidagi tartib raqami ("0".."6"), hex emas:
-- palitra yorug' va qorong'i temada turli ton beradi, raqam esa ikkala
-- temada ham to'g'ri rangga ishora qiladi. Bo'sh — avvalgi qoida.
-- ═══════════════════════════════════════════════════════════════════

alter table tags add column if not exists color text
  check (color is null or color ~ '^[0-9]$');
