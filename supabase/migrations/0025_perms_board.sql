-- ═══════════════════════════════════════════════════════════════════════
-- RUXSATLAR — yangi ko'rinish uchun poydevor
-- ═══════════════════════════════════════════════════════════════════════
-- Yangi ekran uchta narsani talab qiladi:
--   1. Har loyihaning o'z rangi       -> projects.color
--   2. Xodimning "odatdagi" lavozimi  -> users.position
--   3. Har biriktirmada rol MAJBURIY  -> permissions.role not null
--      va bir loyihada BITTA SMM      -> qisman unique indeks
--
-- Eng nozik joy — eski ma'lumot. Hozir permissions.role NULL bo'lishi
-- mumkin va bir loyihada bir nechta SMM bor bo'lishi mumkin. Ikkalasi
-- ham quyida to'g'rilanadi; yo'qotiladigan ma'lumot yo'q, faqat
-- ortiqcha SMM'lar 'boshqa' roliga o'tadi va migratsiya ularni
-- ro'yxat qilib chiqaradi.
-- ═══════════════════════════════════════════════════════════════════════


-- ── 1. Loyiha rangi ─────────────────────────────────────────────────
alter table projects add column if not exists color text;

alter table projects drop constraint if exists projects_color_check;
alter table projects add constraint projects_color_check
  check (color is null or color ~ '^#[0-9a-fA-F]{6}$');

-- Mavjud loyihalarga palitradan ketma-ket rang. Tartib `created_at`
-- bo'yicha — har safar bir xil natija chiqsin (migratsiya qayta
-- ishga tushsa ranglar sakrab ketmasligi uchun).
with palitra(i, hex) as (
  values (0, '#0284c7'), (1, '#0d9488'), (2, '#d97706'), (3, '#db2777'),
         (4, '#7c3aed'), (5, '#65a30d'), (6, '#4f46e5')
), tartib as (
  select id, (row_number() over (order by created_at, id) - 1) % 7 as i
    from projects where color is null
)
update projects p set color = palitra.hex
  from tartib join palitra on palitra.i = tartib.i
 where p.id = tartib.id;


-- ── 2. Xodim lavozimi ───────────────────────────────────────────────
-- `job_title` ERKIN MATN ("mantajyor", "MOBILOGRAF", "Grafik
-- Dizayner" — bir xil ish turlicha yozilgan), shuning uchun undan rol
-- sifatida foydalanib bo'lmaydi. Yangi ustun cheklangan ro'yxatdan
-- iborat va `job_title` o'z o'rnida (ko'rsatish uchun) qoladi.
alter table users add column if not exists position text;

alter table users drop constraint if exists users_position_check;
alter table users add constraint users_position_check
  check (position is null or position in
    ('montajchi', 'mobilograf', 'smm', 'dizayner', 'kopirayter', 'boshqa'));

-- Bir martalik taxmin: mavjud `job_title` matnidan eng yaqin rolni
-- topadi. Topilmasa 'boshqa' — admin keyin Xodimlar oynasidan
-- to'g'rilaydi. Ataylab faqat NULL qatorlarga tegadi, ya'ni qo'lda
-- qo'yilgan qiymat qayta yozilmaydi.
update users set position = case
    when lower(coalesce(job_title, '')) like '%smm%'                              then 'smm'
    when lower(coalesce(job_title, '')) like '%mobil%'                            then 'mobilograf'
    when lower(coalesce(job_title, '')) like '%montaj%'
      or lower(coalesce(job_title, '')) like '%mantaj%'                           then 'montajchi'
    when lower(coalesce(job_title, '')) like '%dizayn%'
      or lower(coalesce(job_title, '')) like '%design%'                           then 'dizayner'
    when lower(coalesce(job_title, '')) like '%kopiray%'
      or lower(coalesce(job_title, '')) like '%copywr%'                           then 'kopirayter'
    else 'boshqa'
  end
 where position is null;


-- ── 3. Biriktirmada rol majburiy ────────────────────────────────────
-- Avval bo'sh rollar to'ldiriladi: xodimning lavozimi olinadi.
update permissions p set role = coalesce(u.position, 'boshqa')
  from users u where u.id = p.user_id and p.role is null;

-- Ehtiyot chorasi: xodimi o'chib ketgan qator qolsa ham NULL qolmasin.
update permissions set role = 'boshqa' where role is null;


-- ── 4. Bir loyiha — bitta SMM ───────────────────────────────────────
-- Ortiqcha SMM'lar 'boshqa' ga o'tadi, ENG ESKI qator SMM bo'lib
-- qoladi (kim avval biriktirilgan bo'lsa, o'sha mas'ul deb
-- hisoblanadi). O'zgarganlar quyida ro'yxat bo'lib chiqadi.
do $$
declare r record;
begin
  for r in
    select u.username, pr.label
      from (
        select user_id, project_id,
               row_number() over (partition by project_id order by created_at, user_id) as n
          from permissions where role = 'smm'
      ) x
      join users u on u.id = x.user_id
      join projects pr on pr.id = x.project_id
     where x.n > 1
  loop
    raise notice 'SMM roli olib tashlandi: % -> % (endi: boshqa)', r.username, r.label;
  end loop;
end $$;

update permissions p set role = 'boshqa'
 where role = 'smm'
   and exists (
     select 1 from permissions q
      where q.project_id = p.project_id and q.role = 'smm'
        and (q.created_at, q.user_id) < (p.created_at, p.user_id)
   );

-- Endi majburiy qilish xavfsiz.
alter table permissions alter column role set not null;

alter table permissions drop constraint if exists permissions_role_check;
alter table permissions add constraint permissions_role_check
  check (role in ('montajchi', 'mobilograf', 'smm', 'dizayner', 'kopirayter', 'boshqa'));

-- Ikkinchi SMM endi BAZADA ham saqlanmaydi. Interfeys buni oldindan
-- "almashtirish" oynasi bilan ushlaydi, bu esa oxirgi to'siq: ikki
-- admin bir vaqtda ishlasa ham loyiha ikki mas'ulli bo'lib qolmaydi.
create unique index if not exists one_smm_per_project
  on permissions(project_id) where role = 'smm';
