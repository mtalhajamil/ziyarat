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
    : ['name', 'count', 'image', 'map', 'english', 'urdu'];
  for (const name of fields) node.fields[`[data-field="${name}"]`] = new Element();
  if (kind === 'place') {
    for (const name of ['previous', 'next']) node.fields[`[data-action="${name}"]`] = new Element();
  }
  return node;
}

async function loadPage(mode, fail = false) {
  const status = new Element();
  const content = new Element();
  const requests = [];
  const document = {
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
    document, DOMParser, URL, console: {error() {}},
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
  return {context, status, content, requests};
}

test('renders destination data and links only available pages', async () => {
  const {status, content} = await loadPage('home');
  const cards = content.children[0].children;
  assert.equal(status.textContent, '');
  assert.deepEqual(cards.map(card => card.fields['[data-field="name"]'].textContent),
    ['Makkah', 'Madinah', 'Badr', 'Taif', 'Turkiye']);
  assert.equal(cards[1].fields['[data-field="status"]'].children[0].href, 'madinah.html');
  assert.equal(cards[0].fields['[data-field="status"]'].textContent, 'Coming soon');
});

test('renders one place and navigates when more places are supplied', async () => {
  const {context, content} = await loadPage('place');
  const view = content.children[0];
  assert.equal(view.fields['[data-field="name"]'].textContent, 'Quba Mosque');
  assert.equal(view.fields['[data-field="image"]'].src, 'assets/images/quba.jpg');
  assert.equal(view.fields['[data-action="next"]'].disabled, true);

  context.places = [data['data/madinah.json'][0], {...data['data/madinah.json'][0], name: 'Second example'}];
  context.container = new Element();
  vm.runInContext("renderPlaces(container, {content: {kind: 'place'}}, places)", context);
  const multiple = context.container.children[0];
  const next = multiple.fields['[data-action="next"]'];
  const previous = multiple.fields['[data-action="previous"]'];
  assert.equal(next.disabled, false);
  next.events.click();
  assert.equal(multiple.fields['[data-field="name"]'].textContent, 'Second example');
  previous.events.click();
  assert.equal(multiple.fields['[data-field="name"]'].textContent, 'Quba Mosque');
  previous.events.click();
  assert.equal(multiple.fields['[data-field="name"]'].textContent, 'Second example');
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

test('both pages use the same versioned stylesheet and script', () => {
  const pages = ['index.html', 'madinah.html'].map(path => fs.readFileSync(path, 'utf8'));
  for (const asset of ['styles.css', 'site.js']) {
    const versioned = pages.map(page => page.match(new RegExp(`${asset.replace('.', '\\.')}\\?v=[\\w-]+`))?.[0]);
    assert.ok(versioned[0]);
    assert.equal(versioned[0], versioned[1]);
  }
});
