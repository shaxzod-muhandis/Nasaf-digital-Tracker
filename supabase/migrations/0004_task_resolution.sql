-- ═══════════════════════════════════════════════════════════════════════
-- Nasaf Digital Tracker — Vazifa: bajarildi/bajarilmadi + sabab
-- ═══════════════════════════════════════════════════════════════════════
-- Xodim deadline'gacha vazifani "bajarildi" yoki "bajarilmadi" deb
-- belgilashi kerak; bajarilmagan bo'lsa sababini yozadi. Admin/super admin
-- barcha vazifalarni, ularning holati va (bajarilmagan bo'lsa) sababini
-- to'liq ko'radi.
--
-- Bu fayl IDEMPOTENT — `npm run db:migrate` uni qayta ishga tushirsa ham
-- xato bermaydi.
-- ═══════════════════════════════════════════════════════════════════════

alter table tasks add column if not exists reason text;

-- "status" ustunidagi eski check constraint'ni topib, 'failed' holatini
-- qo'shib qayta yaratamiz (nomi 0003'da avtomatik berilgan, shu sababli
-- qattiq yozilgan nom o'rniga qidirib topamiz — ikkinchi marta ishga
-- tushirilsa ham xato bermasligi uchun).
--
-- MUHIM: faqat constraint hali 'failed'ni ruxsat bermasa qayta yaratamiz.
-- Keyingi migratsiya (0005) constraint'ni yanada kengaytiradi ('backlog',
-- 'review') — agar shu fayl migratsiyalar to'liq qayta ishga tushirilganda
-- (bu loyihaning migrate.js'i har safar hammasini qayta bajaradi) allaqachon
-- kengaytirilgan constraint'ni o'zining tor (0004davri) ro'yxati bilan
-- almashtirsa, joriy 'backlog'/'review' qatorlari bilan to'qnashib xato
-- beradi.
do $$
declare
  con_name text;
  con_def text;
begin
  select con.conname, pg_get_constraintdef(con.oid) into con_name, con_def
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'tasks'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%''todo''%';
  if con_name is not null and con_def not like '%''failed''%' then
    execute format('alter table tasks drop constraint %I', con_name);
    alter table tasks add constraint tasks_status_check
      check (status in ('todo', 'in_progress', 'done', 'failed', 'cancelled'));
  end if;
end $$;
