const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const script = fs.readFileSync('site.js', 'utf8');
const data = {
  'data/destinations.json': JSON.parse(fs.readFileSync('data/destinations.json')),
  'data/madinah.json': JSON.parse(fs.readFileSync('data/madinah.json'))
};

class Element {
  constructor() {
    this.children = [];
    this.fields = {};
    this.events = {};
    this.textContent = '';
    this.dataset = {};
  }

  querySelector(selector) { return this.fields[selector] || null; }
  append(node) { this.children.push(node); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(type, handler) { this.events[type] = handler; }
}

function fragment(kind) {
  const node = new Element();
  const fields = kind === 'destination'
    ? ['name', 'image', 'status']
    : ['name', 'image', 'map', 'english', 'urdu', 'image-credit', 'image-source', 'image-license'];
  for (const name of fields) node.fields[`[data-field="${name}"]`] = new Element();
  if (kind === 'place') {
    node.fields['[data-field="image-credit"]'].hidden = true;
    for (const name of ['previous', 'next']) node.fields[`[data-action="${name}"]`] = new Element();
  }
  return node;
}

async function loadPage(mode, fail = false, slug = '') {
  const status = new Element();
  const content = new Element();
  content.dataset.placeSlug = slug;
  const requests = [];
  const navigations = [];
  const document = {
    baseURI: 'https://example.com/ziyarat/',
    getElementById(id) {
      if (id === 'load-status') return status;
      return id === (mode === 'home' ? 'destination-list' : 'place-content') ? content : null;
    },
    createDocumentFragment: () => new Element(),
    createElement: () => new Element(),
    importNode: template => fragment(template.kind)
  };
  class DOMParser {
    parseFromString() {
      return {
        getElementById: id => ({
          tagName: 'TEMPLATE',
          content: {kind: id === 'destination-template' ? 'destination' : 'place'}
        })
      };
    }
  }
  const context = vm.createContext({
    document, DOMParser, URL, window: {location: {assign: url => navigations.push(url)}},
    console: {error() {}},
    fetch: async (path, options) => {
      requests.push({path, cache: options.cache});
      return {
        ok: !fail, status: 503,
        text: async () => fs.readFileSync(path, 'utf8'),
        json: async () => data[path]
      };
    }
  });
  vm.runInContext(script, context);
  await new Promise(resolve => setImmediate(resolve));
  return {context, status, content, requests, navigations};
}

test('renders destination data and links only available pages', async () => {
  const {status, content} = await loadPage('home');
  const cards = content.children[0].children;
  assert.equal(status.textContent, '');
  assert.deepEqual(cards.map(card => {
    const name = card.fields['[data-field="name"]'];
    return name.children[0]?.textContent || name.textContent;
  }),
    ['Makkah', 'Madinah', 'Badr', 'Taif', 'Turkiye']);
  const link = cards[1].fields['[data-field="name"]'].children[0];
  assert.equal(link.href, 'madinah/quba/');
  assert.equal(link.textContent, 'Madinah');
  assert.equal(cards[1].fields['[data-field="status"]'].textContent, data['data/destinations.json'][1].description);
  assert.equal(cards[0].fields['[data-field="status"]'].textContent, 'Coming soon');
  assert.equal(cards[0].fields['[data-field="name"]'].children.length, 0);
  for (const card of [cards[2], cards[3], cards[4]]) {
    assert.equal(card.fields['[data-field="status"]'].textContent, 'Coming soon');
    assert.equal(card.fields['[data-field="name"]'].children.length, 0);
  }
});

test('available destination link covers the card and has a visible keyboard focus', () => {
  const css = fs.readFileSync('styles.css', 'utf8');
  const template = fs.readFileSync('templates.html', 'utf8');
  assert.doesNotMatch(template, /class="card-label"/);
  assert.match(css, /\.destination-card\s*\{[^}]*position:\s*relative/s);
  assert.match(css, /\.destination-link::after\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0/s);
  assert.match(css, /\.destination-card:focus-within\s*\{[^}]*outline:\s*2px solid/s);
});

test('renders each supplied place and navigates between clean URLs', async () => {
  const places = data['data/madinah.json'];
  assert.deepEqual(places.map(place => place.name), [
    'Masjid Quba', 'Masjid Jummah', 'Masjid Qiblatain', 'Masjid Ghamama'
  ]);
  for (const [index, place] of places.entries()) {
    const {status, content, navigations} = await loadPage('place', false, place.slug);
    const view = content.children[0];
    assert.equal(status.textContent, '');
    assert.equal(view.fields['[data-field="name"]'].textContent, place.name);
    assert.equal(view.fields['[data-field="english"]'].textContent, place.english);
    assert.equal(view.fields['[data-field="urdu"]'].textContent, place.urdu);
    assert.equal(view.fields['[data-field="map"]'].href, place.mapUrl);
    assert.equal(view.fields['[data-field="image"]'].src, place.image.src);
    assert.ok(fs.existsSync(place.image.src));
    if (place.image.credit) {
      assert.equal(view.fields['[data-field="image-credit"]'].hidden, false);
      assert.equal(view.fields['[data-field="image-source"]'].href, place.image.credit.sourceUrl);
      assert.equal(view.fields['[data-field="image-license"]'].href, place.image.credit.licenseUrl);
    } else {
      assert.equal(view.fields['[data-field="image-credit"]'].hidden, true);
    }
    assert.equal(view.fields['[data-action="next"]'].disabled, false);
    view.fields['[data-action="previous"]'].events.click();
    view.fields['[data-action="next"]'].events.click();
    assert.deepEqual(navigations, [
      `https://example.com/ziyarat/madinah/${places[(index + places.length - 1) % places.length].slug}/`,
      `https://example.com/ziyarat/madinah/${places[(index + 1) % places.length].slug}/`
    ]);
  }
});

test('displays image attribution and rejects unsafe credit links', async () => {
  const {context} = await loadPage('place');
  const credit = {
    description: 'Example image by Photographer (resized)',
    sourceUrl: 'https://commons.wikimedia.org/example',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/'
  };
  context.container = new Element();
  context.places = [{...data['data/madinah.json'][0], image: {...data['data/madinah.json'][0].image, credit}}];
  vm.runInContext("renderPlaces(container, {content: {kind: 'place'}}, places)", context);
  const view = context.container.children[0];
  assert.equal(view.fields['[data-field="image-credit"]'].hidden, false);
  assert.equal(view.fields['[data-field="image-source"]'].textContent, credit.description);
  assert.equal(view.fields['[data-field="image-source"]'].href, credit.sourceUrl);
  assert.equal(view.fields['[data-field="image-license"]'].textContent, credit.license);
  assert.equal(view.fields['[data-field="image-license"]'].href, credit.licenseUrl);
  context.places[0].image.credit.licenseUrl = 'javascript:alert(1)';
  assert.throws(
    () => vm.runInContext("renderPlaces(container, {content: {kind: 'place'}}, places)", context),
    /Invalid image license URL/
  );
});

test('disables navigation for a single place', async () => {
  const {context} = await loadPage('place');
  context.places = [data['data/madinah.json'][0]];
  context.container = new Element();
  vm.runInContext("renderPlaces(container, {content: {kind: 'place'}}, places)", context);
  const view = context.container.children[0];
  assert.equal(view.fields['[data-action="previous"]'].disabled, true);
  assert.equal(view.fields['[data-action="next"]'].disabled, true);
});

test('rejects unknown, unsafe or duplicate place slugs', async () => {
  const {status} = await loadPage('place', false, 'missing');
  assert.match(status.textContent, /Unable to load content/);
  const {context} = await loadPage('place');
  context.container = new Element();
  for (const places of [
    [{...data['data/madinah.json'][0], slug: '../quba'}],
    [data['data/madinah.json'][0], data['data/madinah.json'][0]]
  ]) {
    context.places = places;
    assert.throws(
      () => vm.runInContext("renderPlaces(container, {content: {kind: 'place'}}, places)", context),
      /Invalid or duplicate place slug/
    );
  }
});

test('shows an error when content cannot be loaded', async () => {
  const {status, content} = await loadPage('home', true);
  assert.match(status.textContent, /Unable to load content/);
  assert.equal(content.children.length, 0);
});

test('rejects unsafe map URLs before rendering', async () => {
  const {context} = await loadPage('place');
  context.places = [{...data['data/madinah.json'][0], mapUrl: 'javascript:alert(1)'}];
  context.container = new Element();
  assert.throws(
    () => vm.runInContext("renderPlaces(container, {content: {kind: 'place'}}, places)", context),
    /Google Maps HTTPS link/
  );
  assert.equal(context.container.children.length, 0);
});

test('revalidates templates and data instead of using stale cached content', async () => {
  const {requests} = await loadPage('place');
  assert.deepEqual(requests.map(request => request.path), ['templates.html', 'data/madinah.json']);
  assert.ok(requests.every(request => request.cache === 'no-cache'));
});

test('all pages use the same versioned stylesheet and script', () => {
  const pages = ['index.html', 'madinah.html', 'madinah/index.html',
    ...data['data/madinah.json'].map(place => `madinah/${place.slug}/index.html`)]
    .map(path => fs.readFileSync(path, 'utf8'));
  for (const asset of ['styles.css', 'site.js']) {
    const versioned = pages.map(page => page.match(new RegExp(`${asset.replace('.', '\\.')}\\?v=[\\w-]+`))?.[0]);
    assert.ok(versioned[0]);
    assert.ok(versioned.every(version => version === versioned[0]));
  }
  assert.ok(pages.every(page => page.includes('<link rel="icon" href="assets/favicon.svg?v=20261121-14" type="image/svg+xml">')));
  assert.match(fs.readFileSync('assets/favicon.svg', 'utf8'), /<svg\b/);
});

test('directory pages resolve resources and navigation from the project root', () => {
  for (const [path, url, base] of [
    ['madinah/index.html', 'https://example.com/ziyarat/madinah/', '../'],
    ...data['data/madinah.json'].map(place => [
      `madinah/${place.slug}/index.html`, `https://example.com/ziyarat/madinah/${place.slug}/`, '../../'
    ])
  ]) {
    const html = fs.readFileSync(path, 'utf8');
    assert.ok(html.includes(`<base href="${base}">`));
    const root = new URL(base, url);
    for (const asset of ['styles.css', 'site.js', 'templates.html', 'data/madinah.json', 'assets/images/quba.jpg', 'assets/favicon.svg']) {
      assert.equal(new URL(asset, root).href, `https://example.com/ziyarat/${asset}`);
    }
    assert.equal(new URL('./', root).href, 'https://example.com/ziyarat/');
  }
  const quba = fs.readFileSync('madinah/quba/index.html', 'utf8');
  assert.match(quba, /data-place-slug="quba"/);
  assert.match(quba, /href="madinah\/">Madinah<\/a>/);
  assert.match(quba, /aria-current="page">Quba/);
  for (const place of data['data/madinah.json']) {
    const page = fs.readFileSync(`madinah/${place.slug}/index.html`, 'utf8');
    assert.ok(page.includes(`data-place-slug="${place.slug}"`));
  }
});

test('place template announces its title without a preview label', () => {
  const template = fs.readFileSync('templates.html', 'utf8');
  assert.doesNotMatch(template, /Design preview|data-field="count"/i);
  assert.doesNotMatch(template, /More places will be added later\./);
  assert.match(template, /data-field="name" aria-live="polite"/);
});

test('long bilingual descriptions preserve paragraphs and use a local Urdu font', () => {
  for (const place of data['data/madinah.json']) {
    assert.ok(place.english.includes('\n\n'));
    assert.ok(place.urdu.includes('\n\n'));
  }
  const css = fs.readFileSync('styles.css', 'utf8');
  const template = fs.readFileSync('templates.html', 'utf8');
  assert.match(css, /white-space:\s*pre-line/);
  assert.match(css, /assets\/fonts\/noto-naskh-arabic\.woff2/);
  assert.match(template, /data-field="urdu" lang="ur" dir="rtl"/);
  assert.equal(fs.readFileSync('assets/fonts/noto-naskh-arabic.woff2').subarray(0, 4).toString(), 'wOF2');
});
