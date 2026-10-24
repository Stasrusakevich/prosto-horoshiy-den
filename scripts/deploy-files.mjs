import fs from 'node:fs';
const files=['package.json','package-lock.json','vercel.json','api/index.mjs','lib/domain.mjs','lib/storage.mjs','lib/read-cache.mjs','docs/index.html','docs/app.js','docs/connected.js','docs/style.css','docs/assets/film-still.webp'];
console.log(JSON.stringify(files.map(file=>({file,data:fs.readFileSync(file).toString(file.endsWith('.webp')?'base64':'utf8'),encoding:file.endsWith('.webp')?'base64':'utf-8'}))));
