const fs = require('node:fs');
const path = require('node:path');

for (const id of ['madinah', 'makkah', 'badr']) {
  const {places} = JSON.parse(fs.readFileSync(`data/${id}.json`, 'utf8'));
  for (const {slug, name} of places) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`Invalid slug: ${slug}`);
    const title = name.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const url = `../?place=${slug}`;
    const file = path.join(id, slug, 'index.html');
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="0;url=${url}">
    <link rel="canonical" href="${url}">
    <title>${title} | Ziyarat</title>
  </head>
  <body><p>Opening ${title}. <a href="${url}">Continue</a></p></body>
</html>
`);
  }
}
