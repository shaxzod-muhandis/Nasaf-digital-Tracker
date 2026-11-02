-- ═══════════════════════════════════════════════════════════════════
-- RLS — Supabase Advisor'dagi 26 ta "RLS Disabled in Public" ogohi
--
-- MUAMMO. Supabase `public` sxemadagi HAR BIR jadvalni PostgREST
-- orqali `https://<ref>.supabase.co/rest/v1/` manzilida ochadi. U
-- yerga kirish uchun anon kalit yetarli, anon kalit esa Supabase
-- modelida MAXFIY EMAS — u brauzerga chiqariladigan qiymat. Haqiqiy
-- himoya RLS bo'lishi kerak edi, lekin u hech bir jadvalda yoqilmagan.
--
-- Ya'ni anon kalit qo'lga tushsa — users, ncoin_transactions,
-- tg_messages va qolgani to'liq o'qiladi va yoziladi.
--
-- NIMA UCHUN ILOVA BUZILMAYDI. Ilova PostgREST orqali emas,
-- to'g'ridan-to'g'ri Postgres'ga `postgres` roli bilan ulanadi
-- (lib/db.js, DATABASE_URL). O'sha rolda `rolbypassrls = true`,
-- ya'ni u RLS'ni butunlay chetlab o'tadi. Tekshirilgan:
--   current_user = postgres, rolbypassrls = true
--   public sxemadagi 26 ta jadvalning egasi ham postgres
--
-- SIYOSAT (policy) ATAYLAB YOZILMAYDI. Siyosatsiz RLS "hech kimga
-- ruxsat yo'q" degani — aynan shu kerak: anon/authenticated rollar
-- butunlay to'siladi, ilova esa avvalgidek ishlayveradi.
-- Autentifikatsiya qayerda bo'lsa, o'sha yerda qoladi — Express
-- ichida, Telegram initData imzosi bo'yicha.
--
-- Advisor shundan keyin "RLS Enabled No Policy" deb eslatib turishi
-- mumkin — bu INFO darajasidagi eslatma va bizning holatimizda
-- KUTILGAN natija, xato emas.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Eslatma: keyinchalik qo'shiladigan YANGI jadvallar uchun ham
-- `enable row level security` yozib qo'yish kerak — Postgres buni
-- avtomatik qilmaydi.
