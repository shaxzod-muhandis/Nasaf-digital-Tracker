# UI uslubi — Nasaf Digital Tracker

Yangi ekran, komponent yoki o'zgarish qo'shishdan oldin shu faylni o'qing.
Maqsad: ilova bitta odam chizgandek ko'rinishi. Yangi narsa mavjud
narsaga **o'xshab** qurilsin — ko'chirib, moslab — noldan emas.

To'liq vizual hujjat (har bir ekran surati va har bir tugma nima
qilishi, 74 bet): `docs/nasaf-tracker-UI-hujjat.pdf`.

## 1. Asosiy tamoyillar

1. **Avval mavjudini toping.** Yangi ro'yxat kerakmi — bor ro'yxatni
   toping (`grep` bilan klass nomi), uning CSS va JS'idan foydalaning.
   Yangi tugma, pill, sheet, toast yaratmang — `.btn`, `.st-pill`,
   `.sheet`, `showToast()` bor.
2. **Ranglar faqat o'zgaruvchilar orqali.** `color: #6b7280` emas,
   `color: var(--t2)`. Aks holda qorong'i temada buziladi.
3. **Ikki tema, ikki o'lcham.** Har bir o'zgarish yorug' + qorong'i,
   telefon (390px) + kompyuter (1440px) — to'rt holatda ko'rilishi kerak.
4. **Holat rangi — faqat holat uchun** va doim matn bilan birga.
5. **Til — o'zbekcha (lotin)**, qisqa, "siz" bilan.

## 2. Ranglar (CSS o'zgaruvchilari)

Hammasi `private/app.html` boshidagi `:root` da, qorong'i qiymatlari
`[data-theme="dark"]` blokida. Yangi o'zgaruvchi qo'shsangiz — **ikkala**
blokka ham.

### Asos

| O'zgaruvchi | Yorug' | Nima uchun |
|---|---|---|
| `--brand` | `#2f7ab9` | Brend ko'ki: asosiy tugma, faol holat, havola |
| `--bg` | `#f7f8fa` | Sahifa foni |
| `--surf` | `#ffffff` | Karta, oyna yuzasi |
| `--surf2` | `#fafbfc` | Ichki yuza, jadval sarlavhasi |
| `--ink` | `#0f172a` | Asosiy matn |
| `--t5` | `#374151` | To'q ikkinchi darajali matn |
| `--t2` | `#6b7280` | Yordamchi matn |
| `--t3` | `#8b929c` | Sust matn, izoh |
| `--t4` | `#9aa1ac` | Eng sust (placeholder) |
| `--chip` | `#f1f3f6` | Chip, yumshoq tugma foni |
| `--track` | `#e6e9ed` | Progress chizig'i asosi |
| `--bd1`…`--bd4` | `rgba(15,23,42,.06….14)` | Chegara chiziqlari (ingichkadan qalinga) |
| `--red`, `--red-bg` | `#dc2626`, `#fdecec` | Xato, o'chirish |

### Loyiha holati

Har bir holatda uch o'zgaruvchi: matn, fon (`-bg`), nuqta (`-dot`).

| Holat | Matn | Fon | Nuqta | Yorliq |
|---|---|---|---|---|
| Qarz / Jiddiy ortda | `--st-debt` `#dc2626` | `#fdecec` | `#dc2626` | «Qarz», «Jiddiy ortda» |
| Ortda | `--st-mid` `#7d6608` | `#fdf8e1` | `#eab308` | «Ortda» |
| Rejada | `--st-onplan` `#255f91` | `#eaf2f9` | `#2f7ab9` | «Rejada» |
| Oldinda / Bajarildi | `--st-ahead` `#15803d` | `#e8f6ec` | `#16a34a` | «Oldinda», «Bajarildi» |

Holat qanday hisoblanishi — `CLAUDE.md` → "Uch joyda bir xil". Rang
tanlashda `ST_COLOR` xaritasidan foydalaning, rangni qo'lda yozmang.

### Tur va teglar

| Nima | Matn | Fon |
|---|---|---|
| Post | `--type-post` `#255f91` | `--type-post-bg` `#eaf2f9` |
| Stories | `--type-story` `#7c3aed` | `--type-story-bg` `#f3edfd` |
| Ncoin | `--nav-coin-ink` `#a45f08` | `--nav-coin-bg` `#fbf1e4` |
| Teg ranglari | `--tagblue`, `--purple`, `--pink`, `--teal`, `--amber`, `--green` (har birining `-bg` jufti bor) | |

Faollik issiqlik xaritasi: `--act-lvl-0` … `--act-lvl-4` (kulrangdan
brend ko'kigacha).

Har bir **loyihaning o'z rangi** bor (`projects.color`). U loyiha nuqtasi,
nishoni va kartasida bir xil ishlatiladi — loyiha ekrandan ekranga
rangidan tanib olinadi.

## 3. Tipografika

- Shrift: **Sora** (Google Fonts), zaxira `-apple-system, sans-serif`.
  Kalendar bo'limi tarixan **Onest** ishlatadi — yangi joyda Sora.
  Raqam/kod: `ui-monospace, SFMono-Regular, Menlo, monospace`.
- Og'irliklar: 400 / 500 / 600 / 700 (300 yuklanmaydi).
- O'lchamlar:
  - sahifa sarlavhasi 19–22px, 600–700;
  - karta sarlavhasi ~13px, 600;
  - asosiy matn 13–13.5px;
  - yordamchi matn 11.5–12px, `--t2`/`--t3`;
  - pill/nishon 11px, 600.

## 4. Shakl va o'lchamlar

| Element | Burchak |
|---|---|
| Pill, avatar, nuqta | `99px` |
| Karta, oyna (sheet/modal) | `14px` |
| Tugma, input | `10–12px` (`.btn` — 12px) |
| Kichik nishon (`.st-pill`) | `7–9px` |

- Tugma balandligi: oddiy `46px`, kichik (`.btn-sm`) `38px`.
  Tegiladigan element kamida ~36–40px bo'lsin (telefon).
- Chegara: `1px solid var(--bd2)`; soya ishlatilmaydi yoki juda yengil.
- Ikonkalar: inline SVG, chiziq uslubi, qalinligi 1.6–2px,
  `stroke="currentColor"`. Rasm/ikonka fayli va emoji-ikonka ishlatilmaydi
  (bot xabarlaridan tashqari).

## 5. Tayyor komponentlar

| Kerak bo'lsa | Ishlating |
|---|---|
| Asosiy tugma | `<button class="btn btn-blue">` |
| Ikkinchi darajali | `.btn.btn-soft` |
| O'chirish | `.btn.btn-danger` |
| Kichik | `+ .btn-sm` |
| Yuklanish | tugma ichida `<span class="spinner">` (rangga o'zi moslashadi) |
| Holat nishoni | `<span class="st-pill st-onplan">Rejada</span>` |
| Pastdan chiquvchi oyna | `.sheet` (mavjud sheet'lardan birini namuna qiling) |
| Qisqa xabar | `showToast("Saqlandi")` |
| Uzun forma (telefon) | modal emas, to'liq ekran (Yangi vazifa / Yangi loyiha kabi) — klaviatura formani siqmasligi uchun |

## 6. Joylashuv

- **Telefon (<860px):** pastda navigatsiya paneli. Ichki ekran (Tracker,
  vazifa detali, profil) ochilganda panel yashiriladi, orqaga —
  Telegram'ning o'z "Back" tugmasi.
- **Kompyuter (≥860px):** chapda doimiy yon menyu, pastki panel yo'q.
- Tayanch o'lcham — **"Bugun" sahifasi**: yon chekka 32px, kartalar
  oralig'i 16px. Yangi sahifani shunga moslang.
- **Telegram Desktop tugmalari** ("⋯", "✕") o'ng yuqori burchakda sahifa
  ustiga tushadi. Shuning uchun to'liq sahifalarda ≥860px da tepadan
  ~56px, o'ngdan ~132–156px bo'sh joy beriladi. Bu bo'shliqni
  **shartsiz** `@media (min-width: 860px)` ichida bering — "Telegram
  ichidamizmi?" tekshiruviga bog'lamang (ikki marta sinab ko'rilgan,
  ishlamagan). Yangi to'liq sahifa qo'shsangiz, shu qoidani takrorlang.
- Safe area: `--tg-safe-top`, `--tg-safe-bottom` o'zgaruvchilari
  Telegram'dan keladi — tepa/pastga yopishgan elementlarda ishlating.
- Tema `localStorage.nasaf_theme` da, sahifa chizilishidan oldin
  qo'llanadi (`data-theme="dark"`).

## 7. Matnlar

- O'zbekcha lotin, tutuq belgisi `'` (o'zbek, so'z). Raqam va sana:
  `3-noyabr`, `05.11`, `14:30`.
- Qisqa va aniq: «Saqlandi», «Vazifa ochildi», «Ruxsat yo'q».
- Xatoda — nima bo'ldi va nima qilish kerak: «Rasm yuklanmadi — internetni
  tekshirib, qayta urining».
- Rollar: Xodim, Admin, Super admin. Loyiha ichidagi rollar: SMM, dizayner,
  montajchi, mobilograf, kopirayter, boshqa.
- Holat nomlari aynan: Qarz, Jiddiy ortda, Ortda, Rejada, Oldinda,
  Bajarildi. Vazifa holatlari — `TASK_STATUS_LABEL` dagidek: Backlog,
  Boshlanmagan, Jarayonda, Tekshiruvda, Bajarilgan, Bajarilmadi,
  Bekor qilingan.

## 8. Devor ekrani (TV)

TV (`nasaf-wall-screen/web/index.html`) shu brend tizimida, lekin
1920×1080 qat'iy kanvasda va CSS o'zgaruvchilarsiz (ranglar to'g'ridan-
to'g'ri yozilgan). U yerda o'zgartirish qilganda shu fayldagi qiymatlarni
ishlating. Batafsil — o'sha repodagi `CLAUDE.md`.

## 9. Tekshirish ro'yxati

- [ ] Yorug' va qorong'i temada ko'rildi
- [ ] 390px va 1440px kenglikda ko'rildi, gorizontal aylantirish yo'q
- [ ] Yangi rang — o'zgaruvchi, ikkala temada
- [ ] Holat rangi yonida matn bor
- [ ] Mavjud komponent ishlatildi (yangi tugma/pill chizilmadi)
- [ ] Desktop'da Telegram tugmalari uchun bo'shliq bor (to'liq sahifa bo'lsa)
- [ ] Matn o'zbekcha, qisqa
