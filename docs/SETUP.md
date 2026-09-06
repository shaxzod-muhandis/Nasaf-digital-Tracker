# Sozlash qo'llanmasi — Faza 0 + Faza 1 (Postgres/Supabase o'tishi)

Bu hujjat `docs/ROADMAP.md`da rejalashtirilgan ishning birinchi ikki bosqichini
(Faza 0: xavfsizlik tozalash, Faza 1: Supabase/Postgres'ga o'tish + davr
motori) ishga tushirish uchun amaliy qo'llanma. Kodning o'zi allaqachon
yozilgan va 26 ta integratsion test bilan tekshirilgan — bu qo'llanma faqat
uni sizning haqiqiy Supabase va Netlify muhitingizga ulash bo'yicha.

## 0. Avval — XAVFSIZLIK: eski kalitlarni bekor qiling

Ilgari `.env.example` faylida **haqiqiy** `BOT_TOKEN` va `JSONBIN_KEY`
qiymatlari ochiq holda saqlanib kelgan edi (git tarixida ham qolgan bo'lishi
mumkin). Bu fayl endi faqat placeholder'lar bilan tozalandi, lekin eski
kalitlarning o'zi hali ham amal qiladi — ularni sizdan boshqa hech kim
bekor qila olmaydi, shu sababli buni birinchi navbatda o'zingiz bajarishingiz
kerak:

1. **Telegram bot tokeni**: Telegram'da [@BotFather](https://t.me/BotFather) →
   botingizni tanlang → `/token` → "Revoke current token" → yangi token oling.
   Yangisini keyingi qadamlarda `BOT_TOKEN` sifatida ishlatasiz.
2. **JSONBin API kaliti**: [jsonbin.io](https://jsonbin.io) dashboard →
   API Keys → eski kalitni o'chiring (yoki "Regenerate") → yangisini oling.
   Bu kalit endi faqat bir martalik migratsiya skripti uchun kerak bo'ladi
   (pastga qarang), keyin butunlay tashlab yuborish mumkin.

Migratsiya skriptini sinab ko'rishda eski kalit bilan JSONBin'ga **GET**
so'rovi 403 (ruxsatsiz) qaytardi — demak u allaqachon amal qilmay qolgan
yoki noto'g'ri bo'lishi mumkin. Har holda, yuqoridagi ikkala kalitni ham
yangilashni tavsiya qilamiz.

## 1. Supabase loyihasini yaratish

1. [supabase.com](https://supabase.com) → "New project".
2. Loyiha yaratilgach: **Project Settings → Database → Connection string**
   bo'limiga o'ting.
3. **"Connection pooling"** (Transaction mode, port `6543`) rejimidagi
   ulanish satrini nusxalang — u shunday ko'rinishda bo'ladi:
   ```
   postgresql://postgres.xxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-region.pooler.supabase.com:6543/postgres
   ```
   Netlify Functions har chaqiriqda yangi (yoki qayta ishlatiladigan
   "warm") ulanish ochishi mumkin bo'lgani uchun aynan **pooler** (6543)
   rejimi kerak — oddiy to'g'ridan-to'g'ri ulanish (5432) emas.

## 2. Lokal `.env` faylini sozlash

```bash
cp .env.example .env
```

`.env` faylini oching va quyidagilarni to'ldiring:

- `DATABASE_URL` — yuqoridagi Supabase pooler ulanish satri.
- `BOT_TOKEN` — yangi (rotatsiya qilingan) Telegram bot tokeni.
- `ADMIN_CHAT_IDS` — bildirishnoma oladigan admin/menejerlarning Telegram
  chat ID'lari (vergul bilan). Chat ID'ni [@userinfobot](https://t.me/userinfobot)
  orqali bilib olishingiz mumkin.
- `CRON_SECRET` — o'zingiz o'ylab topgan tasodifiy maxfiy so'z (masalan
  terminalda `openssl rand -hex 16` buyrug'i bilan generatsiya qiling).

`.env` fayli `.gitignore`'da — u hech qachon git'ga tushmaydi.

## 3. Bog'liqliklarni o'rnatish

```bash
npm install
```

Bu safar `pg` (node-postgres) paketi ham o'rnatiladi — Supabase'ga
to'g'ridan-to'g'ri SQL orqali ulanish uchun ishlatiladi (PostgREST/
`@supabase/supabase-js` emas — bu loyihaning oddiyroq va sinovdan
o'tkazish osonroq yondashuvi).

## 4. Sxema (schema) migratsiyasi

```bash
npm run db:migrate
```

Bu `supabase/migrations/` papkasidagi barcha `.sql` fayllarni tartib bilan
`DATABASE_URL`'ingizga qarshi ishga tushiradi:

- **`0001_init.sql`** — asosiy jadvallar: `users`, `projects`,
  `project_cycles`, `checks`, `permissions`, `notification_log`,
  `app_settings`.
- **`0002_staff_and_check_details.sql`** — xodimlar va post tafsilotlari:
  - `staff` jadvali — montajchi / mobilograf / SMM manager va h.k.
    ro'yxati. `users` dan **mustaqil**: video oluvchi odam Telegram'ga
    kirmasa ham bu yerda bo'ladi (admin qo'lda kiritadi).
  - `checks` jadvaliga uchta ustun: `editor_id` (kim montaj qildi),
    `videographer_id` (kim video oldi) va `work_date` (ish qaysi kuni
    bajarildi — kalendar shu sana bo'yicha chiziladi).

`0002` **idempotent** — `npm run db:migrate` uni qayta ishga tushirsa ham
xato bermaydi. Mavjud `checks` yozuvlarida `work_date` bo'sh bo'lsa,
`done_at` (Toshkent vaqti) dan avtomatik to'ldiriladi.

**Muqobil usul**: agar `npm run db:migrate` biror sababga ko'ra ishlamasa,
migratsiya fayllarining mazmunini (avval `0001`, keyin `0002`) Supabase
dashboard → **SQL Editor**'ga joylab, "Run" tugmasini bosishingiz ham
mumkin — natija bir xil.

### Testlar

```bash
npm test           # asosiy oqim (26 ta test)
npm run test:staff # xodimlar, post tafsilotlari va tabel (20 ta test)
```

Ikkalasi ham real Postgres'ga ulanadi va o'zidan keyin test ma'lumotlarini
tozalaydi.

## 5. Boshlang'ich foydalanuvchilarni yuklash

```bash
npm run db:seed
```

Bu eski tizimdagi qattiq yozilgan foydalanuvchilarni (`shaxzodshokirov`,
`jahongirjuraqulov` — super admin; qolganlar — xodim) yangi `users`
jadvaliga kiritadi. Agar avvalgi tizimda kimdir admin panelidan dinamik
admin qilib tayinlangan bo'lsa, buni **Boshqaruv → Adminlar** bo'limidan
qayta belgilashni unutmang — seed skripti buni bilmaydi.

## 6. Eski JSONBin ma'lumotlarini ko'chirish (agar kerak bo'lsa)

Agar hozirgi JSONBin'dagi bin'da haqiqiy loyihalar/belgilar bo'lsa va
ularni yo'qotmasdan Postgres'ga o'tkazmoqchi bo'lsangiz:

```bash
# .env fayliga vaqtinchalik JSONBIN_BIN_ID va JSONBIN_KEY (yangi
# rotatsiya qilingan) qiymatlarini qo'shing, keyin:

node scripts/migrate-from-jsonbin.js --dry-run
```

`--dry-run` hech narsa yozmaydi — faqat nima ko'chirilishini konsolga
chiqaradi (necha loyiha, necha foydalanuvchi, necha belgi topilgani).
Natija to'g'ri ko'ringach:

```bash
node scripts/migrate-from-jsonbin.js --yes
```

**Muhim**: bu skript faqat **bo'sh** (yangi migratsiya qilingan, lekin
hali loyihasiz) Postgres bazasida bir marta ishga tushirish uchun
mo'ljallangan. Ikki marta ishga tushirish loyihalarni/belgilarni
takrorlashi mumkin.

Agar hozircha JSONBin'da jiddiy ma'lumot yo'q bo'lsa (masalan hali test
bosqichida bo'lsangiz), bu qadamni butunlay o'tkazib yuborishingiz va
`npm run db:seed`dan keyin admin panel orqali loyihalarni qo'lda qayta
yaratishingiz ham mumkin.

## 7. Lokal test qilish

```bash
node test/smoke.js
```

Bu skript haqiqiy Postgres'ga ulangan asl `api.js`ni real HTTP so'rovlar
bilan sinaydi (26 ta tekshiruv: autentifikatsiya, xodim/admin boshqaruvi,
loyiha va davr yaratish, ruxsatlar, check belgilash, ko'p oylik rollover
va qarz hisoblash, davrni tahrirlash/arxivlash, cron endpoint'lar). Barcha
tekshiruvlar `✅` bo'lishi kerak.

Netlify Functions'ni to'liq lokal muhitda (bot va Mini App bilan birga)
sinash uchun:

```bash
npm run dev
```

## 8. Netlify'ga deploy qilish

Netlify dashboard → Site settings → **Environment variables** bo'limida
quyidagilarni qo'shing (qiymatlar `.env` fayldagi bilan bir xil, faqat
`DATABASE_URL` — bu safar to'g'ridan-to'g'ri Supabase production
qiymati):

| Nomi | Tavsif |
|---|---|
| `DATABASE_URL` | Supabase pooler ulanish satri |
| `BOT_TOKEN` | Telegram bot tokeni |
| `ADMIN_CHAT_IDS` | Bildirishnoma oluvchilar chat ID'lari (vergul bilan) |
| `CRON_SECRET` | Cron so'rovlarini himoyalash uchun maxfiy so'z |

So'ng oddiy `git push` (yoki Netlify CLI orqali) deploy qiling.

## 9. Kunlik/davriy avtomatlashtirish (cron)

**Tashqi xizmat sozlash shart emas** — `netlify/functions/scheduled-daily.js`
Netlify'ning o'z ichki "Scheduled Functions" imkoniyati orqali (bu
fayldagi `netlify.toml`da `schedule = "0 3 * * *"` — har kuni 03:00 UTC,
ya'ni 08:00 Toshkent vaqtida) avtomatik ishga tushadi va quyidagi uchta
endpoint'ni ketma-ket, o'zi chaqiradi. Deploy qilinganidan keyin hech
kim qo'lda hech narsa sozlashi shart emas.

Har bir endpoint alohida ham (masalan tekshirish uchun qo'lda, yoki
zaxira sifatida tashqi cron xizmati — masalan
[cron-job.org](https://cron-job.org) — orqali) chaqirilishi mumkin.
Barchasi `X-Cron-Secret` header'ida yuqoridagi `CRON_SECRET` qiymatini
talab qiladi:

- **`POST /api/cycles/rollover`** — har kuni bir marta (masalan har kuni
  ertalab soat 06:00'da) chaqiring. Bu barcha loyihalarning davrini
  tekshiradi, muddati o'tganlarini yopadi (kerak bo'lsa "qarz" belgisi
  bilan), yangi davr ochadi va tegishli xabarlarni Telegram'ga yuboradi.
- **`POST /api/reminder/run`** — xohlagan chastotada (masalan haftada
  ikki marta) chaqiring. Bu hali to'liq bajarilmagan loyihalarga
  biriktirilgan xodimlarga "necha kun qoldi, haftasiga nechta post/story
  kerak" tarzidagi eslatma, shuningdek muddati o'tgan-u hali "Jarayonda"ga
  o'tmagan (Biriktirilgan holatidagi) vazifalar uchun to'g'ridan-to'g'ri
  ohangdagi eslatma yuboradi.
- **`POST /api/birthdays/run`** — **HAR KUNI** (masalan `/api/cycles/rollover`
  bilan bir vaqtda) chaqirilishi shart — bu boshqalardan farqli, xohlagan
  chastota bilan emas, chunki "2 kundan keyin tug'ilgan kun" aynan bitta
  kunga to'g'ri keladi; kamroq chastota bilan chaqirilsa ba'zi tug'ilgan
  kunlar butunlay o'tkazib yuborilishi mumkin. Super Adminlarga, tug'ilgan
  kuni 2 kundan keyin keladigan xodimlar haqida (ism, sana, necha yoshga
  to'lishi) xabar yuboradi.

Barcha so'rovlar shunday ko'rinishda bo'lishi kerak:

```
POST https://SIZNING-SAYTINGIZ.netlify.app/api/cycles/rollover
Header: X-Cron-Secret: <CRON_SECRET qiymati>
```

## Nima o'zgardi? (qisqacha)

- **Ma'lumotlar bazasi**: JSONBin.io (bitta JSON fayl) → Postgres
  (Supabase). Endi bir vaqtning o'zida yozish/o'qishda ma'lumot
  yo'qolish xavfi yo'q, va tarix (checklar, davrlar) to'liq saqlanadi.
- **"Oy" tushunchasi → "davr" (cycle)**: har bir loyiha endi o'zining
  mustaqil boshlanish sanasiga (`anchor_date`) ega va har oy avtomatik
  o'sha kundan boshlab yangi davr ochadi — kalendar oyi (1-sanadan)
  bilan cheklanib qolmaydi. Bu aynan oyning o'rtasida (masalan 22-kunda)
  boshlangan loyihalar uchun so'ralgan xususiyat.
- **"Qarz" (qarz) tizimi**: davr yopilganda agar barcha post/stories
  belgilanmagan bo'lsa, o'sha davr avtomatik "qarzli" deb belgilanadi va
  frontend'da qizil banner bilan ko'rsatiladi. Qarz faqat vizual
  ogohlantirish — moliyaviy hisob-kitobga avtomatik ta'sir qilmaydi
  (buni admin qo'lda boshqaradi). Eski (yopilgan) davrga qaytib checklar
  belgilash orqali qarzni "yopish" mumkin.
- **Admin panel**: "Oylar" tab'i endi "Loyihalar" bo'lib, har bir loyiha
  mustaqil tahrirlanadi (label, post/stories maqsadlari) va "arxivlash"
  (yumshoq o'chirish — tarix saqlanadi) orqali olib tashlanadi. Har bir
  loyiha kartasida "Tarix" havolasi orqali barcha o'tgan davrlarni
  ko'rish va kerak bo'lsa ularni tuzatish mumkin.
- **Xodimlar/ruxsatlar tab'i**: endi kodga qattiq yozilgan
  `MANAGED_USERS` ro'yxati emas, balki `/api/users` orqali dinamik —
  yangi xodim qo'shish uchun kod deploy qilish shart emas, to'g'ridan-
  to'g'ri admin panelidan qo'shiladi.
- **Adminlik xatosi tuzatildi**: eskiroq tizimda `POST /api/admins`
  orqali admin qilingan xodim faqat Netlify funksiyasi "issiq" turgan
  vaqtgacha admin bo'lib qolar edi (xotirada saqlanardi), keyingi "sovuq
  start"da bu unutilardi. Endi bu ma'lumot bazada saqlanadi va doimiy.

## Keyingi bosqichlar

Ushbu qo'llanma faqat `docs/ROADMAP.md`dagi **Faza 0 va Faza 1**ni
qamrab oladi. Quyidagilar hali ishlab chiqilmagan va navbatdagi
bosqichlarda amalga oshiriladi:

- **Faza 2**: to'liq vazifa (task) modeli — muayyan xodimga biriktirilgan,
  muddati bor alohida vazifalar (hozircha faqat post/stories sonlari bor).
- **Faza 3**: MVP jamoa bonusi (admin qo'lda tanlaydi, tizim faqat
  statistika/reyting ko'rsatadi), individual bonuslar tarixi, va shaxsiy
  kabinet (xodim faqat umumiy oylik summasini ko'radi, loyiha bo'yicha
  taqsimotni emas).
- **Faza 4**: brauzer dashboard (Telegram Login Widget orqali kirish).
- **Faza 5**: yakuniy silliqlash va gamifikatsiya elementlari.

To'liq tafsilotlar va qabul qilingan biznes-logika qarorlari uchun
`docs/ROADMAP.md`ga qarang.

## 10. Yangi: Profil + Vazifalar (hammasi Mini App ichida)

Tizim **faqat Telegram Mini App orqali** ishlaydi — alohida web-sayt,
web-login yoki sessiya-kuki YO'Q (bunday yondashuv sinovdan o'tkazildi va
ataylab bekor qilindi — client Telegram'dan tashqarida ochilishni
xohlamadi). Yangi funksiyalar mavjud `private/app.html`ning o'ziga, xuddi
shu dizayn tizimi (ranglar, komponentlar, Bottom Nav) va xuddi shu
`X-Telegram-Init-Data` autentifikatsiyasi bilan qo'shildi.

### Nima qo'shildi

- **`users` jadvaliga profil maydonlari**: `first_name`, `last_name`,
  `birth_date`, `phone`, `job_title`, `telegram_user_id`, `avatar_url`
  (`supabase/migrations/0003_web_profile_tasks.sql`). `telegram_user_id`
  hozircha faqat `/api/register-chat` orqali to'ldiriladi (kelajakda
  kerak bo'lishi mumkin — masalan boshqa integratsiyalar uchun).
- **`tasks` jadvali** — xodimga (Telegram akkaunti bor `users` yoki
  Telegram'siz `staff`) biriktirilgan, muddati bor vazifalar. To'liq CRUD:
  `GET/POST/PATCH/DELETE /api/tasks`.
- **`GET/PATCH /api/me`** — profilni ko'rish/tahrirlash. Mini App'ning
  o'zida ishlatiladi: yuqori o'ng burchakdagi avatarga bosilganda Profil
  sheet'i ochiladi; profil to'liq bo'lmasa (`profileIncomplete`), kirishda
  majburiy onboarding ekrani ko'rsatiladi.
- **Yangi bottom-nav tab — "Vazifalar"**: barcha xodimlar o'ziga
  biriktirilgan vazifalarni ko'radi va statusini o'zgartiradi; admin yangi
  vazifa yaratadi/o'chiradi (FAB tugmasi orqali).
- **Boshqaruv → Ruxsatlar tabida** — har bir xodim qatorida ✎ tugmasi
  qo'shildi: admin shu yerdan xodimning ism/familiya/telefon/lavozim/
  tug'ilgan sana va faollik holatini tahrirlaydi.
- **Katta ekranga moslashish** — `@media (min-width:860px)` qoidasi
  kontentni (va Bottom Nav'ni) 560px kenglikda markazlashtiradi, dizayn
  o'zi o'zgarmaydi. `initApp()`da `tg().requestFullscreen()` chaqiruvi ham
  qo'shildi (Bot API 8.0+, kompyuterda ham to'liq ekran).
- **Bekor qilingan yondashuv (tarix uchun)**: avval alohida React web-sayt
  + Telegram Login Widget + sessiya-kuki qurilgan edi. Bu butunlay olib
  tashlandi (`netlify/functions/lib/webauth.js` o'chirildi, `auth.js` faqat
  initData'ga qaytdi). Eski kod `_archived_web_unused/` papkasida saqlanib
  qoldi (build'ga kirmaydi, ishlatilmaydi) — agar kerak bo'lmasa, xohlagan
  vaqtingizda butunlay o'chirib tashlashingiz mumkin.

### Migratsiya va test

```bash
npm run db:migrate     # 0003_web_profile_tasks.sql shu bilan qo'llanadi (idempotent)
npm test                # mavjud 26 test — regressiya yo'qligini tasdiqlaydi
npm run test:staff      # mavjud 20 test
npm run test:profile    # yangi: /api/me, tasks, bildirishnomalar jurnali — 17 test
```

Barcha 63 test (`npm test` + `npm run test:staff` + `npm run test:profile`)
✅ o'tishi kerak. Yangi environment o'zgaruvchisi yo'q — mavjud
`BOT_TOKEN`/`DATABASE_URL`/`ADMIN_CHAT_IDS`/`CRON_SECRET` yetarli.
