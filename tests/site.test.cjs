const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const script = fs.readFileSync('site.js', 'utf8');
const configs = Object.fromEntries(['madinah', 'makkah', 'badr', 'taif', 'turkiye'].map(id =>
  [`data/${id}.json`, JSON.parse(fs.readFileSync(`data/${id}.json`))]));
const destinationIds = JSON.parse(fs.readFileSync('data/destinations.json'));
const data = {
  'data/destinations.json': destinationIds.map(id => configs[`data/${id}.json`]),
  'data/madinah.json': configs['data/madinah.json'].places,
  'data/makkah.json': configs['data/makkah.json'].places,
  'data/badr.json': configs['data/badr.json'].places
};

class Element {
  constructor() {
    this.children = [];
    this.fields = {};
    this.events = {};
    this.textContent = '';
    this.dataset = {};
    this.attributes = {};
    this.hidden = false;
    this.classList = {
      values: new Set(),
      add(value) { this.values.add(value); },
      contains(value) { return this.values.has(value); }
    };
  }
  get scrollHeight() { return this._scrollHeight ?? Math.ceil(this.textContent.length / 40) * 20; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] ?? null; }
  querySelector(selector) { return this.fields[selector] || null; }
  append(node) { this.children.push(node); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(type, handler) { this.events[type] = handler; }
  focus() { this.focused = true; }
}

function fragment(kind) {
  const node = new Element();
  const fields = kind === 'destination'
    ? ['name', 'image', 'status']
    : ['name', 'image', 'map', 'english', 'urdu', 'image-credit', 'image-source', 'image-license',
      'image-placeholder', 'descriptions', 'description-empty',
      'english-panel', 'urdu-panel', 'language-en', 'language-ur',
      'english-more', 'urdu-more', 'video'];
  for (const name of fields) node.fields[`[data-field="${name}"]`] = new Element();
  if (kind === 'place') {
    node.fields['.place-preview'] = node;
    node.fields['[data-field="image-credit"]'].hidden = true;
    node.fields['[data-field="image-placeholder"]'].hidden = true;
    node.fields['[data-field="description-empty"]'].hidden = true;
    for (const name of ['previous', 'next']) node.fields[`[data-action="${name}"]`] = new Element();
  }
  return node;
}

async function loadPage(mode, fail = false, slug = '', destination = 'madinah') {
  const status = new Element();
  const content = new Element();
  content.dataset.placeSlug = slug;
  content.dataset.destination = destination;
  const requests = [];
  const navigations = [];
  const initialUrl = new URL(`place.html?destination=${encodeURIComponent(destination)}${slug ? `&place=${encodeURIComponent(slug)}` : ''}`, 'https://example.com/ziyarat/').href;
  const historyEntries = [initialUrl];
  const historyStates = [null];
  let historyIndex = 0;
  const breadcrumb = new Element();
  const destinationBreadcrumb = new Element();
  const document = {
    baseURI: mode === 'home' ? 'https://example.com/ziyarat/' : initialUrl,
    title: '',
    body: {style: {setProperty() {}}},
    getElementById(id) {
      if (id === 'load-status') return status;
      if (id === 'destination-breadcrumb') return destinationBreadcrumb;
      return id === (mode === 'home' ? 'destination-list' : 'place-content') ? content : null;
    },
    querySelector(selector) {
      return selector === '.breadcrumbs [aria-current="page"]' ? breadcrumb : null;
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
  const window = {
    location: {href: initialUrl, assign: url => navigations.push(url)},
    history: {
      state: null,
      pushState(state, _title, url) {
        historyEntries.splice(historyIndex + 1);
        historyStates.splice(historyIndex + 1);
        historyEntries.push(new URL(url, window.location.href).href);
        historyStates.push(state);
        historyIndex += 1;
        this.state = state;
        window.location.href = historyEntries[historyIndex];
      },
      replaceState(state, _title, url) {
        this.state = state;
        window.location.href = new URL(url, window.location.href).href;
        historyEntries[historyIndex] = window.location.href;
        historyStates[historyIndex] = state;
      }
    },
    getComputedStyle: () => ({lineHeight: '20px'}),
    events: {},
    addEventListener(type, handler) { this.events[type] = handler; },
    removeEventListener(type, handler) {
      if (this.events[type] === handler) delete this.events[type];
    }
  };
  const context = vm.createContext({
    document, DOMParser, URL, window,
    console: {error() {}},
    fetch: async (path, options) => {
      requests.push({path, cache: options.cache});
      return {
        ok: !fail, status: 503,
        text: async () => fs.readFileSync(path, 'utf8'),
        json: async () => path === 'data/destinations.json' ? destinationIds : configs[path]
      };
    }
  });
  vm.runInContext(script, context);
  await new Promise(resolve => setImmediate(resolve));
  function goToHistory(index) {
    historyIndex = index;
    window.location.href = historyEntries[index];
    window.history.state = historyStates[index];
    window.events.popstate?.({state: historyStates[index]});
  }
  return {context, status, content, requests, navigations, historyEntries, goToHistory, breadcrumb, destinationBreadcrumb};
}

test('homepage provides a reachable social preview without JavaScript', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const image = 'https://mtalhajamil.github.io/ziyarat/assets/images/share.jpg';
  for (const [attribute, name, content] of [
    ['property', 'og:type', 'website'],
    ['property', 'og:title', 'Places of ziyarat'],
    ['property', 'og:url', 'https://mtalhajamil.github.io/ziyarat/'],
    ['property', 'og:image', image],
    ['property', 'og:image:width', '1200'],
    ['property', 'og:image:height', '630'],
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:image', image]
  ]) {
    assert.ok(html.includes(`<meta ${attribute}="${name}" content="${content}">`), name);
  }
  assert.ok(fs.existsSync('assets/images/share.jpg'));
});

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
  assert.equal(link.href, 'place.html?destination=madinah');
  assert.equal(link.textContent, 'Madinah');
  assert.equal(cards[1].fields['[data-field="status"]'].textContent, data['data/destinations.json'][1].description);
  for (const index of [0, 2]) {
    assert.equal(cards[index].fields['[data-field="status"]'].textContent, data['data/destinations.json'][index].description);
    assert.equal(cards[index].fields['[data-field="name"]'].children[0].href, data['data/destinations.json'][index].page);
  }
  for (const card of [cards[3], cards[4]]) {
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

test('renders each supplied place and navigates using shared page URLs', async () => {
  const places = data['data/madinah.json'];
  assert.deepEqual(places.map(place => place.name), [
    'Masjid Quba', 'Masjid Jummah', 'Masjid Qiblatain', 'Masjid Ghamama',
    'Masjid al-Saqia', 'Masjid Umar (R.A)', "Ka'b bin Ashraf Ka Qila",
    'Masjid-e-Shaykhain', 'Jabal-e-Uhud', 'Jabal-e-Ruma', 'Masjid Fasih',
    'Masjid-e-Rayah', "Masjid-e-Sab'ah", 'Masjid-e-Fath',
    'Masjid-e-Utban bin Malik (R.A)', 'Masjid Banu Unaif',
    'Masjid Al-Mustarāh (Masjid Bani Harisa)', 'Masjid Abuzar Ghifari (Masjid Sajdah)',
    'Masjid-e-Ijaba (Mubaahila)', 'Masjid banu zafar', 'Masjid al-Sabq',
    'Saqifah Bani Saedah', 'Masjid-e-tooba', 'Masjid MinarTeen', 'Ares Well',
    "Uthman Ibn Affan's Farm & Well", 'Ghars well', 'Khaake Shifa'
  ]);
  for (const [index, place] of places.entries()) {
    const {status, content, navigations, historyEntries} = await loadPage('place', false, place.slug);
    const view = content.children[0];
    assert.equal(status.textContent, '');
    assert.equal(view.fields['[data-field="name"]'].textContent, place.name);
    if (place.english !== undefined || place.urdu !== undefined) {
      assert.equal(view.fields['[data-field="english"]'].textContent, place.english ?? 'English translation coming soon.');
      assert.equal(view.fields['[data-field="urdu"]'].textContent, place.urdu ?? 'Urdu description coming soon.');
      assert.equal(view.fields['[data-field="description-empty"]'].hidden, true);
      assert.equal(view.fields['[data-field="descriptions"]'].hidden, false);
    } else {
      assert.equal(view.fields['[data-field="descriptions"]'].hidden, true);
      assert.equal(view.fields['[data-field="description-empty"]'].hidden, false);
    }
    assert.equal(view.fields['[data-field="video"]'].hidden, !place.videoUrl);
    if (place.videoUrl) assert.equal(view.fields['[data-field="video"]'].href, place.videoUrl);
    assert.equal(view.fields['[data-field="map"]'].href, place.mapUrl);
    if (place.image) {
      assert.equal(view.fields['[data-field="image"]'].src, place.image.src);
      assert.ok(fs.existsSync(place.image.src));
      assert.equal(view.fields['[data-field="image-placeholder"]'].hidden, true);
    } else {
      assert.equal(view.fields['[data-field="image"]'].hidden, true);
      assert.equal(view.fields['[data-field="image-placeholder"]'].hidden, false);
    }
    if (place.image?.credit) {
      assert.equal(view.fields['[data-field="image-credit"]'].hidden, false);
      assert.equal(view.fields['[data-field="image-source"]'].href, place.image.credit.sourceUrl);
      assert.equal(view.fields['[data-field="image-license"]'].href, place.image.credit.licenseUrl);
    } else {
      assert.equal(view.fields['[data-field="image-credit"]'].hidden, true);
    }
    assert.equal(view.fields['[data-action="next"]'].disabled, false);
    view.fields['[data-action="next"]'].events.click();
    const nextPlace = places[(index + 1) % places.length];
    assert.equal(content.children[0].fields['[data-field="name"]'].textContent, nextPlace.name);
    assert.equal(historyEntries[1], `https://example.com/ziyarat/place.html?destination=madinah&place=${nextPlace.slug}`);
    content.children[0].fields['[data-action="previous"]'].events.click();
    assert.equal(content.children[0].fields['[data-field="name"]'].textContent, place.name);
    assert.equal(navigations.length, 0);
  }
});

test('Madinah place photos use their location codes and exist locally', () => {
  for (const place of data['data/madinah.json'].filter(place => place.image)) {
    assert.equal(place.image.src, `assets/images/${place.sourceCode}.jpg`);
    assert.ok(fs.existsSync(place.image.src));
  }
});

test('previous and next update place content in-page and honor browser history', async () => {
  const {context, content, historyEntries, goToHistory, navigations, breadcrumb} =
    await loadPage('place', false, 'quba');
  const places = data['data/madinah.json'];
  const initialUrl = historyEntries[0];
  content.children[0].fields['[data-action="next"]'].events.click();

  assert.equal(content.children[0].fields['[data-field="name"]'].textContent, places[1].name);
  assert.equal(historyEntries.length, 2);
  assert.equal(historyEntries[1], `https://example.com/ziyarat/place.html?destination=madinah&place=${places[1].slug}`);
  assert.equal(navigations.length, 0);
  assert.equal(context.document.title, `${places[1].name} | Ziyarat`);
  assert.equal(breadcrumb.textContent, places[1].name);
  assert.equal(content.children[0].classList.contains('place-changing'), true);
  assert.equal(content.children[0].fields['[data-field="name"]'].focused, true);
  const template = fs.readFileSync('templates.html', 'utf8');
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.match(template, /aria-live="polite" tabindex="-1"/);
  assert.match(css, /\.place-preview\.place-changing\s*\{\s*animation:\s*place-change/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.place-preview\.place-changing\s*\{\s*animation:\s*none;/);

  goToHistory(0);
  assert.equal(context.document.title, `${places[0].name} | Ziyarat`);
  assert.equal(content.children[0].fields['[data-field="name"]'].textContent, places[0].name);
  assert.equal(context.window.location.href, initialUrl);

  goToHistory(1);
  assert.equal(context.document.title, `${places[1].name} | Ziyarat`);
  assert.equal(content.children[0].fields['[data-field="name"]'].textContent, places[1].name);
});

test('shared page defaults to the first place and rejects invalid destinations', async () => {
  const {status, content, destinationBreadcrumb} = await loadPage('place');
  assert.equal(status.textContent, '');
  assert.equal(content.children[0].fields['[data-field="name"]'].textContent, 'Masjid Quba');
  assert.equal(destinationBreadcrumb.textContent, 'Madinah');
  assert.equal(destinationBreadcrumb.href, 'place.html?destination=madinah');
  for (const destination of ['', '../madinah', 'Madinah']) {
    const invalid = await loadPage('place', false, '', destination);
    assert.match(invalid.status.textContent, /Unable to load content/);
    assert.equal(invalid.requests.some(request => request.path.includes('data/')), false);
  }
});

test('includes every named Madinah source site and supplied video URL without blank rows', () => {
  const places = data['data/madinah.json'];
  assert.equal(places.length, 28);
  assert.deepEqual(places.slice(17).map(place => place.name), [
    'Masjid Abuzar Ghifari (Masjid Sajdah)', 'Masjid-e-Ijaba (Mubaahila)',
    'Masjid banu zafar', 'Masjid al-Sabq', 'Saqifah Bani Saedah', 'Masjid-e-tooba',
    'Masjid MinarTeen', 'Ares Well', "Uthman Ibn Affan's Farm & Well", 'Ghars well', 'Khaake Shifa'
  ]);
  assert.deepEqual(places.slice(0, 17).map(place => place.sourceCode), [
    'MED-QUBA', 'MED-JUMMA', 'MED-QIBLAT', 'MED-GHAMAMA', 'MED-SAQIA', 'MED-UMAR',
    'MED-KAB-ASHRAF', 'MED-SHAYKHAIN', 'MED-UHUD', 'MED-RUMA', 'MED-FASIH',
    'MED-RAYA', 'MED-SABA', 'MED-FATAH', 'MED-UTBAN', 'MED-BANU-UNAIF', 'MED-MUSTARAH'
  ]);
  assert.deepEqual(places.filter(place => place.videoUrl).map(place => [place.slug, place.videoUrl]), [
    ['saqia', 'https://www.youtube.com/shorts/FVdwdYbFbqw'],
    ['utban', 'https://www.youtube.com/shorts/GNv5tLUf9yo'],
    ['banu-unaif', 'https://www.youtube.com/shorts/u4c0VYG7mFI']
  ]);
  for (const place of places) {
    assert.ok(place.mapUrl);
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
  context.container = new Element(); context.container.dataset.destination = "madinah";
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

test('Makkah and Badr load their own data, placeholders and local navigation', async () => {
  const makkah = data['data/makkah.json'];
  assert.deepEqual(makkah.map(place => place.sourceCode), [
    'MAK-HUDAYBIYYAH', 'MAK-THAWR', 'MAK-HIJRAH', 'MAK-ABU-BAKR', 'MAK-IBN-ZUBAIR',
    'MAK-ASMA-ABI-BAKR', 'MAK-IBN-UMAR', 'MAK-BAYAH', 'MAK-KHUBAYB', 'MAK-MAIMOONA'
  ]);
  assert.deepEqual(makkah.map(place => place.name), [
    'Masjid Al-Hudaybiyyah (Al-Shumaisi)', 'Ghar Thawr (Cave of Thawr / جبل ثور)',
    'Masjid Al-Hijrah', 'Masjid Abu Bakr As-Siddiq (Makkah)', 'Maqam e Abdullah Ibn Zubair RA',
    'Maqam e Asma Binte Abi Bakr RA', 'Grave of Abdullah Ibn Umar RA',
    "Masjid Al-Bay'ah (مسجد البيعة / عقبة)", 'Masjid Khubayb Bin Adiy RA (Tan\'im)',
    'Grave of Hazrat Maimoona RA (Saraf)'
  ]);
  assert.deepEqual(makkah.map(place => new URL(place.mapUrl).searchParams.get('query')), [
    'Masjid Al-Hudaybiyyah (Al-Shumaisi), Makkah', 'Ghar Thawr (Cave of Thawr / جبل ثور), Makkah',
    'Masjid Al-Hijrah, Makkah', 'Masjid Abu Bakr As-Siddiq (Makkah), Makkah',
    'Maqam e Abdullah Ibn Zubair RA, Makkah', 'Maqam e Asma Binte Abi Bakr RA, Makkah',
    'Grave of Abdullah Ibn Umar RA, Makkah', "Masjid Al-Bay'ah (مسجد البيعة / عقبة), Makkah",
    "Masjid Khubayb Bin Adiy RA (Tan'im), Makkah", 'Grave of Hazrat Maimoona RA (Saraf), Makkah'
  ]);
  assert.ok(makkah.every(place => !place.videoUrl && !place.english && !place.urdu));
  for (const [destination, count] of [['makkah', 10], ['badr', 6]]) {
    const places = data[`data/${destination}.json`];
    assert.equal(places.length, count);
    for (const place of places) {
      const {status, content, requests, navigations, historyEntries} =
        await loadPage('place', false, place.slug, destination);
      assert.equal(status.textContent, '');
      assert.equal(requests[1].path, `data/${destination}.json`);
      const view = content.children[0];
      assert.equal(view.fields['[data-field="name"]'].textContent, place.name);
      assert.equal(view.fields['[data-field="map"]'].href, place.mapUrl);
      assert.equal(new URL(place.mapUrl).searchParams.get('query'), `${place.name}, ${destination === 'makkah' ? 'Makkah' : 'Badr'}`);
      assert.equal(view.fields['[data-field="image-placeholder"]'].hidden, Boolean(place.image));
      if (place.image) {
        assert.equal(place.image.src, `assets/images/${place.sourceCode}.jpg`);
        assert.ok(fs.existsSync(place.image.src));
        assert.equal(view.fields['[data-field="image"]'].src, place.image.src);
        assert.equal(view.fields['[data-field="image-source"]'].textContent, place.image.credit.description);
        assert.equal(view.fields['[data-field="image-license"]'].href, place.image.credit.licenseUrl);
      }
      assert.equal(view.fields['[data-field="description-empty"]'].hidden, false);
      view.fields['[data-action="next"]'].events.click();
      const nextPlace = places[(places.indexOf(place) + 1) % count];
      assert.equal(content.children[0].fields['[data-field="name"]'].textContent, nextPlace.name);
      assert.equal(
        historyEntries[1],
        `https://example.com/ziyarat/place.html?destination=${destination}&place=${nextPlace.slug}`
      );
      content.children[0].fields['[data-action="previous"]'].events.click();
      assert.equal(content.children[0].fields['[data-field="name"]'].textContent, place.name);
      assert.equal(navigations.length, 0);
    }
    const {content} = await loadPage('place', false, '', destination);
    assert.equal(content.children[0].fields['[data-field="name"]'].textContent, places[0].name);
  }
  const {status} = await loadPage('place', false, '', '../unknown');
  assert.match(status.textContent, /Unable to load content/);
});

test('descriptions default to English and switch languages without changing text', async () => {
  for (const place of data['data/madinah.json'].filter(place => place.english !== undefined)) {
    const {content} = await loadPage('place', false, place.slug);
    const view = content.children[0];
    const english = view.fields['[data-field="english-panel"]'];
    const urdu = view.fields['[data-field="urdu-panel"]'];
    const enButton = view.fields['[data-field="language-en"]'];
    const urButton = view.fields['[data-field="language-ur"]'];
    assert.equal(english.hidden, false);
    assert.equal(urdu.hidden, true);
    assert.equal(enButton.ariaPressed, 'true');
    assert.equal(urButton.ariaPressed, 'false');
    urButton.events.click();
    assert.equal(english.hidden, true);
    assert.equal(urdu.hidden, false);
    assert.equal(enButton.ariaPressed, 'false');
    assert.equal(urButton.ariaPressed, 'true');
    enButton.events.click();
    assert.equal(english.hidden, false);
    assert.equal(urdu.hidden, true);
    assert.equal(enButton.ariaPressed, 'true');
    assert.equal(urButton.ariaPressed, 'false');
    assert.equal(view.fields['[data-field="english"]'].textContent, place.english);
    assert.equal(view.fields['[data-field="urdu"]'].textContent, place.urdu);
  }
  const template = fs.readFileSync('templates.html', 'utf8');
  assert.match(template, /data-field="urdu-panel" lang="ur" dir="rtl"/);
  assert.match(template, /aria-controls="english-description"/);
  assert.match(template, /aria-controls="urdu-description"/);
  assert.doesNotMatch(template, /id="(?:english|urdu)-heading"/);
  assert.match(template, /aria-label="English description"/);
  assert.match(template, /aria-label="Urdu description"/);
  const {content} = await loadPage('place', false, 'saqia');
  assert.equal(content.children[0].fields['[data-field="descriptions"]'].hidden, false);
  assert.equal(typeof content.children[0].fields['[data-field="language-en"]'].events.click, 'function');
});

test('description previews expand after three lines and omit redundant controls', async () => {
  const {context} = await loadPage('place');
  context.container = new Element(); context.container.dataset.destination = "madinah";
  context.container.dataset = {placeSlug: 'quba', destination: 'madinah'};
  context.places = [{...data['data/madinah.json'][0], english: 'Long description. '.repeat(30), urdu: 'طویل تفصیل۔ '.repeat(30)}];
  vm.runInContext("renderPlaces(container, {content: {kind: 'place'}}, places)", context);
  const view = context.container.children[0];
  const english = view.fields['[data-field="english"]'];
  const more = view.fields['[data-field="english-more"]'];
  assert.equal(english.dataset.collapsed, 'true');
  assert.equal(more.hidden, false);
  assert.equal(more.textContent, 'Show more');
  assert.equal(more.getAttribute('aria-expanded'), 'false');
  assert.equal(more.getAttribute('aria-label'), 'Show more description');
  more.events.click();
  assert.equal(english.dataset.collapsed, 'false');
  assert.equal(more.textContent, 'Show less');
  assert.equal(more.getAttribute('aria-expanded'), 'true');
  assert.equal(more.getAttribute('aria-label'), 'Show less description');
  more.events.click();
  assert.equal(english.dataset.collapsed, 'true');
  assert.equal(more.getAttribute('aria-expanded'), 'false');
  view.fields['[data-field="language-ur"]'].events.click();
  const urduMore = view.fields['[data-field="urdu-more"]'];
  assert.equal(urduMore.hidden, false);
  assert.equal(view.fields['[data-field="urdu"]'].dataset.collapsed, 'true');
  assert.equal(urduMore.getAttribute('aria-label'), 'مزید تفصیل دکھائیں');
  urduMore.events.click();
  assert.equal(urduMore.getAttribute('aria-label'), 'کم تفصیل دکھائیں');

  context.container = new Element(); context.container.dataset.destination = "madinah";
  context.container.dataset = {placeSlug: 'quba', destination: 'madinah'};
  context.places = [{...data['data/madinah.json'][0], english: 'Brief.', urdu: 'مختصر۔'}];
  vm.runInContext("renderPlaces(container, {content: {kind: 'place'}}, places)", context);
  const short = context.container.children[0].fields['[data-field="english-more"]'];
  assert.equal(short.hidden, true);
  context.container.children[0].fields['[data-field="language-ur"]'].events.click();
  assert.equal(context.container.children[0].fields['[data-field="urdu-more"]'].hidden, true);
  context.container.children[0].fields['[data-field="language-en"]'].events.click();
  context.container.children[0].fields['[data-field="english"]']._scrollHeight = 100;
  context.window.events.resize();
  assert.equal(short.hidden, false);
  assert.equal(context.container.children[0].fields['[data-field="english"]'].dataset.collapsed, 'true');
});

test('all supplied Urdu descriptions have English translations', () => {
  for (const destination of ['madinah', 'makkah', 'badr']) {
    for (const place of data[`data/${destination}.json`]) {
      if (place.urdu) assert.ok(place.english?.trim(), `${destination}/${place.slug}`);
    }
  }
});

test('supports Urdu-only descriptions without inventing an English translation', async () => {
  const {context} = await loadPage('place');
  context.container = new Element(); context.container.dataset.destination = "madinah";
  context.container.dataset = {placeSlug: 'saqia', destination: 'madinah'};
  const urdu = 'اصل اردو متن۔';
  context.places = [{...data['data/madinah.json'][4], english: undefined, urdu}];
  vm.runInContext("renderPlaces(container, {content: {kind: 'place'}}, places)", context);
  const view = context.container.children[0];
  assert.equal(view.fields['[data-field="english"]'].textContent, 'English translation coming soon.');
  assert.equal(view.fields['[data-field="urdu"]'].textContent, urdu);
  assert.equal(view.fields['[data-field="language-en"]'].ariaPressed, 'true');
  view.fields['[data-field="language-ur"]'].events.click();
  assert.equal(view.fields['[data-field="urdu-panel"]'].hidden, false);
});

test('places map and video actions in a responsive shared row', () => {
  const template = fs.readFileSync('templates.html', 'utf8');
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.match(template, /<div class="place-actions">\s*<a class="map-link"[\s\S]*?<\/a>\s*<a class="video-link"[\s\S]*?<\/a>\s*<\/div>/);
  assert.match(css, /\.place-actions\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /\.map-link\s*\{[^}]*flex:\s*[^;]+;/s);
  assert.match(css, /\.video-link\s*\{[^}]*flex:\s*[^;]+;/s);
  assert.match(css, /\.video-link\[hidden\]\s*\{\s*display:\s*none;/);
});

test('destination themes provide distinct validated controls', async () => {
  const css = fs.readFileSync('styles.css', 'utf8');
  const themes = ['madinah', 'makkah', 'badr'].map(id => configs[`data/${id}.json`].theme);
  assert.equal(new Set(themes.map(theme => theme.control)).size, 3);
  const {context} = await loadPage('place');
  for (const theme of themes) assert.doesNotThrow(() => context.applyDestinationTheme(theme));
  assert.throws(() => context.applyDestinationTheme({...themes[0], control: 'red; background: url(https://example.com)'}), /Invalid theme color/);
  assert.match(css, /\.map-link\s*\{[^}]*background:\s*var\(--place-control\)/s);
  assert.match(css, /\.video-link\s*\{[^}]*background:\s*var\(--place-video\)/s);
});

test('renders only validated optional YouTube video links', async () => {
  const {context} = await loadPage('place');
  context.container = new Element(); context.container.dataset.destination = "madinah";
  context.container.dataset = {placeSlug: 'saqia', destination: 'madinah'};
  context.places = [{
    ...data['data/madinah.json'][4],
    videoUrl: 'https://www.youtube.com/shorts/FVdwdYbFbqw'
  }];
  vm.runInContext("renderPlaces(container, {content: {kind: 'place'}}, places)", context);
  const video = context.container.children[0].fields['[data-field="video"]'];
  assert.equal(video.hidden, false);
  assert.equal(video.href, context.places[0].videoUrl);
  assert.equal(video.target, '_blank');
  context.places[0].videoUrl = 'https://example.com/video';
  assert.throws(
    () => vm.runInContext("renderPlaces(container, {content: {kind: 'place'}}, places)", context),
    /YouTube HTTPS link/
  );
});

test('shows the licensed Banu Unaif photo with its attribution', async () => {
  const {content} = await loadPage('place', false, 'banu-unaif');
  const view = content.children[0];
  assert.equal(view.fields['[data-field="image"]'].src, 'assets/images/MED-BANU-UNAIF.jpg');
  assert.equal(view.fields['[data-field="image-credit"]'].hidden, false);
  assert.match(view.fields['[data-field="image-source"]'].textContent, /Ayman dhū alghiná/);
});

test('disables navigation for a single place', async () => {
  const {context} = await loadPage('place');
  context.places = [data['data/madinah.json'][0]];
  context.container = new Element(); context.container.dataset.destination = "madinah";
  vm.runInContext("renderPlaces(container, {content: {kind: 'place'}}, places)", context);
  const view = context.container.children[0];
  assert.equal(view.fields['[data-action="previous"]'].disabled, true);
  assert.equal(view.fields['[data-action="next"]'].disabled, true);
});

test('rejects unknown, unsafe or duplicate place slugs', async () => {
  const {status} = await loadPage('place', false, 'missing');
  assert.match(status.textContent, /Unable to load content/);
  const {context} = await loadPage('place');
  context.container = new Element(); context.container.dataset.destination = "madinah";
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
  context.container = new Element(); context.container.dataset.destination = "madinah";
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
  const pages = ['index.html', 'place.html', 'nearby/index.html']
    .map(path => fs.readFileSync(path, 'utf8'));
  for (const asset of ['styles.css', 'site.js']) {
    const versioned = pages.map(page => page.match(new RegExp(`${asset.replace('.', '\\.')}\\?v=[\\w-]+`))?.[0]);
    assert.ok(versioned[0]);
    assert.ok(versioned.every(version => version === versioned[0]));
  }
  for (const asset of ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png']) {
    const references = pages.map(page => page.match(new RegExp(`assets/${asset.replace('.', '\\.')}\\?v=[\\w-]+`))?.[0]);
    assert.ok(references[0]);
    assert.ok(references.every(reference => reference === references[0]));
    assert.ok(fs.existsSync(`assets/${asset}`));
  }
  assert.match(fs.readFileSync('assets/favicon.svg', 'utf8'), /<svg\b/);
});

test('shared page and nearby page resolve resources under a project path', () => {
  const nearby = fs.readFileSync('nearby/index.html', 'utf8');
  assert.ok(nearby.includes('<base href="../">'));
  for (const root of [new URL('https://example.com/ziyarat/place.html?destination=madinah'),
    new URL('../', 'https://example.com/ziyarat/nearby/')]) {
    for (const asset of ['styles.css', 'site.js', 'templates.html', 'data/madinah.json', 'assets/images/MED-QUBA.jpg', 'assets/favicon.svg']) {
      assert.equal(new URL(asset, root).href, `https://example.com/ziyarat/${asset}`);
    }
    assert.equal(new URL('place.html?destination=madinah&place=quba', root).href,
      'https://example.com/ziyarat/place.html?destination=madinah&place=quba');
  }
});

test('renders an English-only description with an Urdu placeholder', async () => {
  const {context} = await loadPage('place');
  context.container = new Element(); context.container.dataset.destination = "madinah";
  context.places = [{...data['data/madinah.json'][4], english: 'Example', urdu: undefined}];
  vm.runInContext("renderPlaces(container, {content: {kind: 'place'}}, places)", context);
  assert.equal(context.container.children[0].fields['[data-field="urdu"]'].textContent, 'اردو تفصیل جلد شامل کی جائے گی۔');
});

test('missing content messages remain visible without displaying empty fields', () => {
  const template = fs.readFileSync('templates.html', 'utf8');
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.match(template, /data-field="image-placeholder" hidden>Image coming soon/);
  assert.match(template, /data-field="description-empty" hidden>Description coming soon/);
  assert.match(css, /\.place-image\[hidden\],[\s\S]*?\.description-grid\[hidden\]\s*\{\s*display:\s*none/);
});

test('uses the supplied Google Maps searches for all places', () => {
  const queries = [
    'Masjid Quba, Madinah', 'Masjid Jummah, Madinah', 'Masjid Qiblatain, Madinah',
    'Masjid Ghamama, Madinah', 'Masjid al-Saqia, Madinah', 'Masjid Umar (R.A), Madinah',
    "Ka'b bin Ashraf Ka Qila, Madinah", 'Masjid-e-Shaykhain, Madinah', 'Jabal-e-Uhud, Madinah',
    'Jabal-e-Ruma, Madinah', 'Masjid Fasih, Madinah', 'Masjid-e-Rayah, Madinah',
    "Masjid-e-Sab'ah, Madinah", 'Masjid-e-Fath, Madinah', 'Masjid-e-Utban bin Malik (R.A), Madinah',
    'Masjid Banu Unaif, Madinah', 'Masjid Al-Mustarāh (Masjid Bani Harisa), Madinah'
  ];
  const places = data['data/madinah.json'];
  assert.deepEqual(places.slice(0, queries.length).map(place => new URL(place.mapUrl).searchParams.get('query')), queries);
  assert.ok(places.slice(17).every(place => new URL(place.mapUrl).hostname === 'maps.app.goo.gl'));
});

test('place template announces its title without a preview label', () => {
  const template = fs.readFileSync('templates.html', 'utf8');
  assert.doesNotMatch(template, /Design preview|data-field="count"/i);
  assert.doesNotMatch(template, /More places will be added later\./);
  assert.match(template, /data-field="name" aria-live="polite"/);
  assert.match(template, /aria-label="Show more description"/);
  assert.match(fs.readFileSync('styles.css', 'utf8'), /-webkit-line-clamp:\s*3/);
});

test('long bilingual descriptions preserve paragraphs and use a local Urdu font', () => {
  for (const place of data['data/madinah.json'].filter(place => place.english !== undefined)) {
    assert.ok(place.english.length > 0);
    assert.ok(place.urdu.length > 0);
  }
  assert.ok(data['data/madinah.json'][0].urdu.includes('\n\n'));
  const css = fs.readFileSync('styles.css', 'utf8');
  const template = fs.readFileSync('templates.html', 'utf8');
  assert.match(css, /white-space:\s*pre-line/);
  assert.match(css, /assets\/fonts\/noto-naskh-arabic\.woff2/);
  assert.match(template, /data-field="urdu" lang="ur" dir="rtl"/);
  assert.equal(fs.readFileSync('assets/fonts/noto-naskh-arabic.woff2').subarray(0, 4).toString(), 'wOF2');
});
