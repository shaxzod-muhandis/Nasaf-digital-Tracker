#!/usr/bin/env node
// Lokal dev server — `netlify dev`ning o'rnini bosadi (loyiha Vercel'ga
// ko'chgach, alohida CLI shart emas: api.js sof Express `app` eksport
// qiladi, shuni to'g'ridan-to'g'ri tinglatamiz).
require("./_env").loadEnv();
const app = require("../netlify/functions/api.js");

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`Lokal server: http://localhost:${PORT}`);
});
