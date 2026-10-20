-- ═══════════════════════════════════════════════════════════════════════
-- Reja taklifnomasining versiyasi (iCalendar SEQUENCE)
--
-- Email orqali yuborilgan taklifnoma kalendarda UID bo'yicha tanaladi.
-- O'zgarish yuborilganda SEQUENCE o'sishi SHART: aks holda Gmail va
-- Apple Mail xatni "eski nusxa" deb hisoblab, kalendardagi rejani
-- yangilamaydi — foydalanuvchi esa eski vaqtni ko'rib turaveradi.
-- ═══════════════════════════════════════════════════════════════════════

alter table events add column if not exists sequence int not null default 0;
