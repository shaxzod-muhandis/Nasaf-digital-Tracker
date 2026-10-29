-- ═══════════════════════════════════════════════════════════════════════
-- TABEL — HAR ROL UCHUN "REJADAGI XODIM" MUHRI
-- ═══════════════════════════════════════════════════════════════════════
-- Tabel to'lov hujjati: oylik hisoblanayotganda ish haqi ishni HAQIQATDA
-- bajargan xodimga yoziladi. Buning uchun har bir yozuvda "o'sha paytda
-- kim rejada edi" degan ma'lumot turishi kerak va u keyin O'ZGARMASLIGI
-- kerak — aks holda Ruxsatlarda rol almashtirilganda o'tgan oylarning
-- hisobi qayta hisoblanib ketardi.
--
-- Bunday muhr hozir faqat SMM uchun bor (`assignee_id`). Mobilograf va
-- montajchi uchun yo'q edi: ular bo'yicha zamena "hozirgi ruxsatlar"
-- bilan solishtirib topilardi, ya'ni rol almashgach eski oylar ham
-- o'zgarardi.
--
-- Sabab ham rolga bog'landi: bitta ishda mobilograf kasal bo'lib
-- almashishi, montajchi esa o'z o'rnida bo'lishi mumkin. Bitta umumiy
-- `substitution_reason` buni ifodalay olmasdi.
-- ═══════════════════════════════════════════════════════════════════════

alter table checks add column if not exists mobilograf_assigned_id uuid references users(id) on delete set null;
alter table checks add column if not exists montajchi_assigned_id  uuid references users(id) on delete set null;

alter table checks add column if not exists mobilograf_reason text;
alter table checks add column if not exists montajchi_reason  text;
alter table checks add column if not exists mobilograf_reason_note text;
alter table checks add column if not exists montajchi_reason_note  text;

alter table checks drop constraint if exists checks_mobilograf_reason_check;
alter table checks add constraint checks_mobilograf_reason_check
  check (mobilograf_reason is null or mobilograf_reason in ('sick','vacation','urgent','other'));

alter table checks drop constraint if exists checks_montajchi_reason_check;
alter table checks add constraint checks_montajchi_reason_check
  check (montajchi_reason is null or montajchi_reason in ('sick','vacation','urgent','other'));

-- ── Eski yozuvlarni to'ldirish ──────────────────────────────────────
-- TZ: "eski yozuvlarda *_assigned_id = yozuv yaratilgan paytdagi ruxsat
-- jadvali bo'yicha; topilmasa — bajaruvchining o'zi (zamena
-- hisoblanmaydi)".
--
-- Yozuv yaratilgan PAYTDAGI ruxsatni tiklab bo'lmaydi (tarix saqlanmagan),
-- shuning uchun hozirgi ruxsat olinadi. Topilmasa bajaruvchining o'zi
-- yoziladi — bu ataylab: noma'lum holatni "zamena" deb ko'rsatish
-- to'lovni noto'g'ri hisoblashga olib kelardi.
update checks c set mobilograf_assigned_id = coalesce(
    (select p.user_id from permissions p
       join project_cycles pc on pc.id = c.cycle_id
      where p.project_id = pc.project_id and p.role = 'mobilograf' limit 1),
    c.videographer_user_id)
 where c.mobilograf_assigned_id is null;

update checks c set montajchi_assigned_id = coalesce(
    (select p.user_id from permissions p
       join project_cycles pc on pc.id = c.cycle_id
      where p.project_id = pc.project_id and p.role = 'montajchi' limit 1),
    c.editor_user_id)
 where c.montajchi_assigned_id is null;

-- Tabel oy bo'yicha o'qiydi.
create index if not exists idx_checks_work_date on checks(work_date) where work_date is not null;
create index if not exists idx_checks_cycle_work_date on checks(cycle_id, work_date);

do $$
declare n int;
begin
  select count(*) into n from checks where mobilograf_assigned_id is null and montajchi_assigned_id is null;
  raise notice 'Muhr qo''yilmagan yozuv: % ta (ikkala rol ham bo''sh)', n;
end $$;
