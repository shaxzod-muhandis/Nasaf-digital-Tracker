# Nasaf Digital — Tracker

Nasaf Digital jamoasi uchun Telegram Mini App: loyihalar bo'yicha post va
stories rejasini yuritish, vazifalar, tabel va Ncoin tizimi.

Ilova **faqat Telegram orqali** ishlaydi — alohida web-login ataylab yo'q.
Har bir so'rov Telegram'ning `initData` imzosi bilan tasdiqlanadi.

## Nima qayerda

| Yo'l | Nima |
|---|---|
| `private/app.html` | Butun frontend — bitta fayl (HTML + CSS + JS, build qadamisiz) |
| `netlify/functions/api.js` | Butun backend — Express ilovasi. Papka nomi tarixiy, deploy Vercel'da |
| `netlify/functions/lib/` | `auth` (Telegram imzosi), `db` (Postgres), `ncoin`, `notify` (bot xabarlari), `cycles` (davrlar), `xlsx` (eksport) |
| `api/index.js` | Vercel kirish nuqtasi — yuqoridagi Express ilovani qayta ishlatadi |
| `supabase/migrations/` | Baza sxemasi, tartib bilan qo'llanadigan SQL fayllar |
| `test/` | Integratsion testlar (alohida test bazasi talab qiladi) |
| `scripts/` | `migrate` (sxemani qo'llash), `seed` (boshlang'ich ma'lumot) |
| `docs/SETUP.md` | Noldan sozlash qo'llanmasi |

## Ishga tushirish

```bash
npm install
```

`.env.local` fayliga kerakli qiymatlarni yozing (`.env.example` ga qarang):
`DATABASE_URL`, `BOT_TOKEN`, `APP_URL`, `CRON_SECRET`, `ADMIN_CHAT_IDS`,
`BLOB_READ_WRITE_TOKEN`.

```bash
npm run db:migrate   # sxemani qo'llash
npm run dev          # lokal server
```

## Testlar

Testlar haqiqiy yozuvlar yaratadi, shuning uchun **alohida baza** talab
qiladi — ishlab turgan bazada ishga tushmaydi:

```bash
# .env.local: TEST_DATABASE_URL='postgresql://...'
npm run db:migrate:test
npm run test:all
```

Batafsil: `docs/SETUP.md` → "Lokal test qilish".

## Deploy

Vercel. `vercel.json` hamma `/api/*` so'rovini bitta funksiyaga
yo'naltiradi va kunlik cron'ni (`/api/cron-daily`, 03:00 UTC) belgilaydi.
Cron davrlarni yangilaydi, eslatma va tug'ilgan kun xabarlarini yuboradi,
hamda eski jurnal yozuvlarini tozalaydi.

## Muhim qoidalar

- `BOT_TOKEN` production'da **majburiy**. U bo'lmasa imzo tekshiruvi
  o'chadi — shuning uchun production'da bunday holatda kirish butunlay
  rad etiladi (`lib/auth.js`).
- Ncoin balansi alohida saqlanmaydi — har doim `ncoin_transactions`
  jadvalidan yig'iladi, shu bilan balans va tarix hech qachon
  bir-biridan uzilmaydi.
- Xodim "o'chirilganda" qatori o'chmaydi, `access_status = 'removed'`
  bo'ladi — tarix va coinlar saqlanib qoladi.
