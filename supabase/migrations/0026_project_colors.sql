-- ═══════════════════════════════════════════════════════════════════════
-- LOYIHA RANGLARI — faol loyihalar bir-biridan ajralib tursin
-- ═══════════════════════════════════════════════════════════════════════
-- 0025 da palitra 7 rangdan iborat edi va ranglar BARCHA loyihalarga
-- (arxivdagilari ham) ketma-ket tarqatilgandi. Bazada 23 loyiha bor,
-- lekin ekranda faqat 10 ta faoli ko'rinadi — natijada o'sha 10 ta
-- orasida uchta juft bir xil rangga tushib qoldi:
--   Miranda Jalyuzi = Granix, Granix press = Voha Group,
--   Porloq = Anhor | Beruniy
--
-- Yangi dizaynda rang — loyihani bir qarashda tanish vositasi, ya'ni
-- takrorlanish aynan shu maqsadni buzadi. Shuning uchun:
--   1. Palitra 12 rangga kengaytirildi (faol loyihalardan ko'p).
--   2. Rang FAOL loyihalarga birinchi navbatda beriladi.
--
-- Arxivdagi loyihalar baribir Ruxsatlar ekranida ko'rinmaydi, shuning
-- uchun ular orasidagi takrorlanish muammo emas.
-- ═══════════════════════════════════════════════════════════════════════

with palitra(i, hex) as (
  values (0,  '#0284c7'), (1,  '#0d9488'), (2,  '#d97706'), (3,  '#db2777'),
         (4,  '#7c3aed'), (5,  '#65a30d'), (6,  '#4f46e5'), (7,  '#c2410c'),
         (8,  '#0891b2'), (9,  '#9333ea'), (10, '#15803d'), (11, '#475569')
), tartib as (
  -- Faol loyihalar oldinda: ular palitraning boshidan, takrorlanmasdan
  -- oladi. `created_at` ichki tartib — migratsiya qayta ishga tushsa
  -- ranglar sakrab ketmasligi uchun.
  select id, (row_number() over (order by is_active desc, created_at, id) - 1) % 12 as i
    from projects
)
update projects p set color = palitra.hex
  from tartib join palitra on palitra.i = tartib.i
 where p.id = tartib.id;

do $$
declare n int;
begin
  select count(*) into n from (
    select color from projects where is_active group by color having count(*) > 1
  ) x;
  if n > 0 then
    raise notice 'DIQQAT: faol loyihalar orasida hali ham % ta takrorlangan rang bor (palitradan ko''p loyiha)', n;
  else
    raise notice 'Faol loyihalarning har biri o''z rangida.';
  end if;
end $$;
