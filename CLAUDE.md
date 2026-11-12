# Nasaf Digital Tracker — Claude uchun yo'riqnoma

Bu fayl Claude (yoki yangi dasturchi) loyihada ish boshlashdan oldin
o'qishi kerak bo'lgan hamma narsani jamlaydi. Avval shuni o'qing, keyin
`README.md`, kerak bo'lsa `docs/`.

## Loyiha nima

Nasaf Digital — SMM agentligi. Bu repo jamoaning ichki tizimi:

- **Telegram Mini App** (panel) — loyihalar bo'yicha oylik post/stories
  rejasi, vazifalar (Kanban), kalendar, tabel, Ncoin (ichki valyuta) va
  NShop. Ilova **faqat Telegram ichida** ochiladi, alohida web-login yo'q.
- **Telegram bot** (`@nasafdigital_bot`) — shaxsiy chatda menyu, guruhlarda
  `/task` bilan vazifa ochish, `/vazifalar`, izohlar, 👍 reaksiya bilan
  ishni mijoz guruhiga yuborish, eslatmalar.
- Qo'shni repo **Nasaf-Statistics** (`nasaf-wall-screen`) — ofisdagi
  televizor uchun devor ekrani. **Bir xil bazani** o'qiydi. Unda ham
  `CLAUDE.md` bor.

Foydalanuvchilar o'zbek tilida gaplashadi. Interfeys, bot matnlari, kod
izohlari va commit xabarlari — **o'zbekcha (lotin)**.

## Tuzilma

| Yo'l | Nima |
|---|---|
| `private/app.html` | Butun frontend — **bitta fayl** (~27 ming qator HTML+CSS+JS), build qadami yo'q |
| `netlify/functions/api.js` | Butun backend — bitta Express ilova (~8 ming qator): API + bot webhook + cron |
| `netlify/functions/lib/` | `auth` (Telegram initData imzosi, rollar), `db`, `cycles` (oylik davrlar), `notify` (bot xabarlari), `ncoin`, `events`/`ics`/`mail` (kalendar), `xlsx` (eksport), `dates` |
| `api/index.js` | Vercel kirish nuqtasi: `module.exports = require("../netlify/functions/api.js")` |
| `supabase/migrations/` | SQL migratsiyalar, raqam tartibida (`0001`…`0034`) |
| `scripts/` | `migrate`, `seed`, `env-check`, `tg-webhook` |
| `test/` | Integratsion testlar — **alohida test baza** talab qiladi |
| `docs/` | `TOPSHIRISH.md` (birinchi kun), `SETUP.md` (noldan sozlash), `UI-USLUB.md` (dizayn qoidalari), `OCHIQ-ISHLAR.md`, `AUDIT-2026-11.md` |

**`netlify/` nomi tarixiy.** Loyiha avval Netlify'da edi, 2026-09-09 da
Vercel'ga ko'chirilgan. Hech narsa Netlify'da ishlamaydi. Papkani qayta
nomlamang — importlar, testlar va hujjatlar shu yo'lga bog'langan.

`api.js` ichida bo'limlar `// ── NOMI ──` sarlavhalari bilan ajratilgan.
Kerakli joyni shular bo'yicha qidiring (`grep -n "^// ── " netlify/functions/api.js`).
Bot qismi taxminan `// ── /task` dan boshlanadi; webhook — `app.post("/api/tg/webhook"`.

## Infratuzilma

- **Hosting:** Vercel, region `hnd1`. `vercel.json` hamma `/api/*` va
  sahifa yo'llarini bitta funksiyaga (`api/index`) yo'naltiradi.
  `main` ga push → Vercel avtomatik deploy qiladi (~1 daqiqa).
- **Baza:** Supabase Postgres. Ulanish — `DATABASE_URL` (pooler, 6543).
  RLS barcha jadvallarda yoqilgan (`0032`), server to'g'ridan-to'g'ri
  ulanadi.
- **Cron:**
  - Vercel cron — kuniga 1 marta `/api/cron-daily` (03:00 UTC):
    davr rollover, eslatmalar, tug'ilgan kun, jurnal tozalash.
  - Supabase `pg_cron` + `pg_net` — **har daqiqa**
    `/api/events/reminders/tick` (kalendar eslatmalari, `0034`). Token
    `app_settings.reminder_tick_token` da, server ham o'sha yerdan o'qiydi.
- **Fayllar:** Vercel Blob (`BLOB_READ_WRITE_TOKEN`).
- **Env:** `.env.example` da har bir kalitning izohi bor. Lokal qiymatlar
  `vercel env pull` bilan olinadi (`.env.local`). Qo'lda `.env` yaratmang.
  `npm run env:check` nima yuklanganini ko'rsatadi.

## Buyruqlar

```bash
npm install
vercel env pull            # .env.local
npm run env:check
npm run dev                # vercel dev — lokal server
npm run db:migrate         # migratsiyalarni qo'llash (PROD bazaga!)
npm run db:migrate:test    # test bazaga
npm run test:all           # 4 to'plam; TEST_DATABASE_URL shart
```

## ⚠️ Qat'iy qoidalar

1. **Testlar hech qachon real bazada ishlamaydi.** `test/_db-guard.js`
   `TEST_DATABASE_URL` bo'lmasa testni to'xtatadi — bu nosozlik emas,
   qo'riqchi. Uni chetlab o'tmang, `ALLOW_PROD_TESTS=1` ni o'zingizcha
   qo'ymang. Real bazasiz tekshirish kerak bo'lsa — `db.js` ni
   `require.cache` orqali soxta (mock) bilan almashtirib, ilovani
   `app.listen(0)` bilan ko'tarib sinang.
2. **Prod bazani tekshirish — faqat o'qish.** Tahlil uchun so'rovlar
   `begin read only; … rollback;` ichida. Ma'lumotni o'zgartirish
   (tuzatish, o'chirish) — faqat egasi aniq rozilik berganda.
3. **`@nasafdigital_manager` — test hisobi**, real xodim emas
   ("Nasaf Manager"). Ncoin, Tabel, faollik hisobotlarida uni chiqarib
   tashlang. Ismga emas, `username` ga qarab ajrating.
4. **Migratsiya prod'ga deploy'dan oldin qo'llanadi** va qayta yuritishga
   chidamli bo'lishi kerak (`if not exists`, `on conflict do nothing`).
   Mavjud migratsiya faylini o'zgartirmang — yangisini qo'shing.
5. **Serverless: ish javobdan OLDIN.** Vercel javob ketishi bilan
   funksiyani muzlatadi. `res.json(...)` dan keyin `await` qilinmagan
   ish yarmida qoladi (bu bir necha marta prod xatosi bo'lgan). Bot
   webhook'i doim 200 qaytaradi, xatoda ham.
6. **Maxfiy qiymatlar** (`BOT_TOKEN`, `DATABASE_URL`, `TG_WEBHOOK_SECRET`,
   `CRON_SECRET`) kodga, commit'ga, chatga yozilmaydi.
7. **`ui-v3` branch'ga tegmang** — eski v3 dizayn tajribasi (2026-09),
   `main` dan 130+ commit orqada. Egasi aytmaguncha merge qilinmaydi.
   Batafsil: `docs/OCHIQ-ISHLAR.md`.

## 🔁 Uch joyda bir xil bo'lishi SHART bo'lgan mantiq

Loyiha foizi, reja chizig'i va holat **uch joyda** hisoblanadi va
uchalasi bir xil natija berishi kerak. Bittasini o'zgartirsangiz —
uchalasini o'zgartiring, aks holda panel, bot va TV turli raqam ko'rsatadi
(2026-11 da aynan shu muammo tuzatilgan).

| Joy | Fayl | Funksiyalar |
|---|---|---|
| Panel | `private/app.html` | `PROJ_POST_VAZNI`, `projPct`, `projElapsedFrac`, `projStatus`, `PROJ_REJA_TOLERANCE`, `PROJ_JIDDIY_GAP`, `ST_COLOR` |
| Bot | `netlify/functions/api.js` | `tgRejaFoizi`, `tgLoyihaHolati`, `tgLoyihalarMatn`; `lib/notify.js` → `POST_VAZNI`, `projectPct` |
| TV | `nasaf-wall-screen/server/lib/stats.js` | `POST_VAZNI`, `projectPct`, `expectedPctOf`, `classifyProject`, `REJA_TOLERANCE`, `JIDDIY_ORTDA_GAP` |

Hozirgi qoida:

- **Foiz — ball bo'yicha, 1 post = 4 stories** (2026-11-10):
  (4 × bajarilgan post + bajarilgan stories) / (4 × reja post + reja stories).
  Vazn faqat foiz va holat uchun, Ncoin'ga aloqasi yo'q. Jamoa foizi ham
  shu ballar bilan. Foiz yonida umumiy son (masalan "5/30") ko'rsatilmaydi —
  u ballga mos kelmaydi; post va stories alohida ko'rsatiladi.
- **Bajarildi** — har tur o'z rejasiga yetganda (`doneK >= k` va `doneS >= s`),
  yaxlitlangan 100% emas.
- **Reja (kutilgan foiz)** — kunlik: `o'tgan kunlar / davr kunlari`,
  bu yerda o'tgan = `davr boshidan bugungacha + 1`, `[0, jami]` oralig'ida.
- **Holat**, `farq = foiz − reja`:

| Shart | Panel kaliti | TV kaliti | Bot | Rang |
|---|---|---|---|---|
| 100% | `done` | `done` | Bajarildi | yashil |
| o'tgan davr rejasi bajarilmay yopilgan | `debt` | `debt` | 🔴 Qarz | qizil |
| farq > +2 | `ahead` | `ahead` | 🟢 Oldinda | yashil |
| −2 … +2 | `onplan` | `onTrack` | 🔵 Rejada | ko'k |
| −3 … −12 | `mid` | `behind` | 🟡 Ortda | sariq |
| < −12 | `behind` | `late` | 🔴 Jiddiy ortda | qizil |

E'tibor: panelda `behind` = **Jiddiy ortda** (qizil), TV'da `behind` =
**Ortda** (sariq). Kalit nomlari tarixan farq qiladi — nomga emas,
yuqoridagi jadvalga qarang.

## Bot (`/task` va boshqalar)

Guruhda vazifa ochish — matnni yozib, oxiriga yoki boshiga `/task`
qatori. Birinchi oddiy qator — sarlavha, qolgani — tavsif. Belgilar
`/task` qatorida yoki har biri alohida qatorda:

| Belgi | Ma'nosi |
|---|---|
| `@ali` | mas'ul (faol xodim username) |
| `11.11` / `11.11.2026` | muddat |
| `14:30` | soat (faqat sana bilan) |
| `!yuqori` `!o'rta` `!past` | daraja |
| `#Reels` | teg (faqat mavjud teglar) |
| `+Anhor` | loyiha — nom boshi yetarli, imlo xatosi va kirillcha kechiriladi (`tgLoyihaTop`) |

Mas'ul zanjiri, loyiha ustuvorligi (matn → forum mavzusi → guruh) va
xatolardagi javoblar `tgHandleTask` izohlarida batafsil yozilgan.
Bot sintaksisini o'zgartirsangiz, bot guruhda belgilanganda chiqadigan
yo'riqnomani (`tgHandleEslatma`) va bo'sh `/task` javobini ham yangilang.

## Kod uslubi

- **Izohlar o'zbekcha va "NIMA UCHUN"ni tushuntiradi** — ayniqsa avval
  qanday edi, qanday xato bo'lgan va nega hozirgi yechim tanlangan
  (sana bilan). Bu loyihaning asosiy hujjati — kodni o'qigan odam qarorni
  tushunishi kerak. Mavjud izohlarni o'chirmang.
- Yangi o'zgaruvchi/funksiya nomlari ko'pincha o'zbekcha (`sarlavha`,
  `masul`, `tgLoyihaTop`) — atrofdagi kod uslubiga moslang.
- Framework yo'q: frontend — oddiy JS + DOM, backend — Express + `pg`.
  Yangi kutubxona qo'shishdan oldin egasidan so'rang.
- `app.html` katta — o'qishda butun faylni emas, kerakli qismni qidiring.
- Foydalanuvchiga ko'rinadigan matn: qisqa, sodda, "siz" bilan. Xatoda
  nima bo'lganini va nima qilish kerakligini ayting.

## UI / UX

Dizayn qoidalari: **`docs/UI-USLUB.md`** — yangi ekran yoki komponent
qo'shishdan oldin albatta o'qing. Qisqasi:

- Ranglar faqat CSS o'zgaruvchilari (`var(--brand)`, `var(--t2)`, …).
  Yangi rang qo'shsangiz — `:root` va qorong'i tema blokiga **ikkalasiga**.
- Shrift Sora. Burchaklar: pill 99px, karta 14px, tugma/maydon 10–12px.
- Holat ranglari (qizil/sariq/ko'k/yashil) faqat holat uchun, va doim
  matn bilan birga.
- Telefon (<860px) va kompyuter (≥860px) — ikkalasida tekshiring,
  yorug' va qorong'i temada.

## Ishni tekshirish va topshirish

1. O'zgarishdan keyin: test (mock yoki test baza) + brauzerda ko'rish
   (`npm run dev`, telefon va desktop kengligida).
2. Commit xabari o'zbekcha, birinchi qatorda nima o'zgargani
   (masalan: `Bot /task: matnda loyiha belgisi (+Anhor)`), keyin qisqa
   sabab.
3. `main` ga push = prod deploy. Kattaroq o'zgarishni alohida branch +
   Pull Request orqali yuboring, egasi ko'rib chiqadi.
4. Deploy holati: GitHub commit status (Vercel) `success` bo'lishini kuting.
