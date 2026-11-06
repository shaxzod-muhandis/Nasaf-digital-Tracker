-- ═══════════════════════════════════════════════════════════════════
-- KALENDAR ESLATMALARI — HAR DAQIQALIK SOAT
--
-- MUAMMO. Eslatma navbatini hech kim muntazam surmasdi. U faqat ikki
-- holatda yuborilardi: kimdir kalendarni ochganda yoki kuniga bir
-- marta ishlaydigan cron'da. Bazadagi haqiqiy ko'rsatkichlar:
--   147 eslatmadan 45 tasi umuman yuborilmagan (2 soat ichida hech kim
--   kalendarni ochmagan va eslatma jimgina tashlab yuborilgan),
--   qolganlari o'rtacha 55 daqiqa kechikkan.
-- "30 daqiqa oldin" qo'yilgan reja shuning uchun 10 daqiqa qolganda
-- yoki umuman kelmasdi.
--
-- NIMA UCHUN BAZADA. Vercel'ning bepul tarifi cron'ni kuniga bir
-- martagina ruxsat beradi. Tashqi cron xizmati esa uchinchi tomon
-- hisobini talab qiladi. Supabase'da esa ikkala kerakli kengaytma bor:
--   pg_cron — har daqiqa vazifa ishga tushiradi,
--   pg_net  — bazadan HTTP so'rov yuboradi.
-- Soat har daqiqa /api/events/reminders/tick ni chaqiradi.
--
-- TOKEN. Chaqiruvni himoyalovchi token shu yerda tasodifiy yaratiladi
-- va app_settings'da saqlanadi. Server ham uni o'sha yerdan o'qiydi —
-- ya'ni maxfiy qiymatni hech kim qo'lda ko'chirmaydi va Vercel
-- sozlamalariga ham qo'shish shart emas.
--
-- LOKAL VA TEST BAZA. Ularda pg_cron odatda yo'q. Bunday holda
-- migratsiya xato bermaydi, faqat eslatib o'tadi — aks holda testlar
-- yiqilardi.
-- ═══════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron')
     or not exists (select 1 from pg_available_extensions where name = 'pg_net') then
    raise notice 'pg_cron yoki pg_net yo''q — eslatma soati o''rnatilmadi (lokal baza bo''lsa, bu kutilgan)';
    return;
  end if;

  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;

  -- Bir marta yaratiladi. Migratsiyalar har safar qaytadan yuritiladi,
  -- token esa o'zgarmasligi kerak — aks holda har migratsiyadan keyin
  -- soat bilan server bir-birini tanimay qolardi.
  insert into public.app_settings (key, value)
  values ('reminder_tick_token',
          to_jsonb(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')))
  on conflict (key) do nothing;

  -- Shu nomli vazifa bor bo'lsa, pg_cron uni yangilaydi — qayta
  -- yuritish xavfsiz, ikkinchi nusxa paydo bo'lmaydi.
  perform cron.schedule(
    'eslatmalar-har-daqiqa',
    '* * * * *',
    $cmd$
      select net.http_post(
        url := 'https://nasaf-digital-tracker.vercel.app/api/events/reminders/tick',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-tick-token', (select value #>> '{}' from public.app_settings where key = 'reminder_tick_token')
        ),
        body := '{}'::jsonb,
        -- Sovuq startda funksiya bir necha soniya ochiladi. Standart
        -- 5 soniya yetmasligi mumkin edi.
        timeout_milliseconds := 30000
      );
    $cmd$
  );

  -- pg_cron har ishga tushishni tarixga yozadi — kuniga 1440 qator.
  -- Tozalanmasa jadval cheksiz o'sadi.
  perform cron.schedule(
    'eslatma-soati-tarixini-tozalash',
    '15 3 * * *',
    $cmd$ delete from cron.job_run_details where end_time < now() - interval '3 days' $cmd$
  );

  raise notice 'Eslatma soati o''rnatildi: har daqiqa';
end $$;
