# ЭлектрКўрик — кўрикдан ўтказиш тизими (PWA)

Vite + React + Appwrite. Смартфон/планшет/компьютерга мослашган, PWA (иконкаси билан ўрнатса бўлади).

## ⚡ Энг муҳими: ҲЕЧ ҚАНДАЙ ПАПКА ЙЎҚ
Барча файл — иконкалар ҳам — бир текисда (илдизда) туради. Шунинг учун GitHub'га юклашда папка муаммоси умуман бўлмайди.

## GitHub'га юклаш
1. Архивни компьютерда **очинг (extract)**.
2. GitHub репозиторийида аввалги нотўғри тушган файлларни ўчиринг (керак бўлса).
3. **Add file → Upload files** → очилган папка ичидаги **БАРЧА файлларни** (16 та) бирваракай судраб ташланг.
4. **Commit changes**. Vercel автомат қайта деплой қилади.

Илдизда қуйидагилар кўриниши керак (ҳаммаси текис, папкасиз):
`index.html, main.jsx, App.jsx, appwrite.js, index.css, package.json, vite.config.js, vercel.json, .gitignore, .env.example, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png, favicon-32.png, README.md`

> Иконкалар илдизда турса ҳам, қуриш (build) пайтида улар автомат тўғри жойга кўчирилади — `vite.config.js` буни ўзи ҳал қилади.

## Vercel
1. Add New → Project → репозиторийни Import (Framework: **Vite**).
2. **Environment Variables** → 6 та ўзгарувчи (Appwrite қийматлари):
   ```
   VITE_APPWRITE_ENDPOINT = https://fra.cloud.appwrite.io/v1
   VITE_APPWRITE_PROJECT = ...
   VITE_APPWRITE_DB = ...
   VITE_APPWRITE_COL_INSPECTIONS = inspections
   VITE_APPWRITE_COL_DEFECTS = defects
   VITE_APPWRITE_BUCKET = photos
   ```
3. Deploy.

## Телефонга ўрнатиш
- **Android (Chrome):** меню → «Установить приложение» / «Add to Home screen».
- **iPhone (Safari):** Share → «На экран Домой».
- Ўрнатилгач, илова алоҳида иконка билан, тўлиқ экранда очилади.

## Иконкани алмаштириш (ихтиёрий)
Илдиздаги PNG файлларни ўз логотипингиз билан, бир хил ўлчамда (192, 512) алмаштиринг. Бошқа ҳеч нарса ўзгартирмайсиз.

## Эслатма
- Environment Variables киритилмаса — оқ экран чиқади.
- Appwrite Web platform hostname'га Vercel доменингиз қўшилган бўлсин.
- PWA фақат HTTPS'да ишлайди (Vercel автомат HTTPS).
