const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const places = JSON.parse(fs.readFileSync('data/madinah.json')).places;
const script = fs.readFileSync('site.js', 'utf8').replace(/\nstart\(\);\s*$/, '');

test('nearby introduction stays available to assistive technology without taking up layout space', () => {
  const template = fs.readFileSync('templates.html', 'utf8');
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.match(template, /id="nearby-title" class="visually-hidden"/);
  assert.match(template, /id="nearby-instructions" class="visually-hidden"/);
  assert.match(template, /aria-describedby="nearby-instructions"/);
  assert.match(css, /\.visually-hidden\s*\{[^}]*position:\s*absolute;[^}]*clip:\s*rect\(0, 0, 0, 0\)/s);
});

class Element {
  constructor() {
    this.children = [];
    this.events = {};
    this.textContent = '';
    this.value = '';
    this.attributes = {};
    this.classes = new Set();
    this.classList = {toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name)};
  }
  append(node) { this.children.push(node); }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(type, handler) { this.events[type] = handler; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  focus() { this.focused = true; }
  querySelectorAll() { return []; }
}

function setup(geolocation) {
  const fields = Object.fromEntries(['map', 'map-frame', 'origin-status', 'tile-status', 'results']
    .map(name => [`[data-field="${name}"]`, new Element()]));
  fields['[data-action="locate"]'] = new Element();
  fields['[data-action="fullscreen"]'] = new Element();
  const container = new Element();
  container.querySelector = selector => fields[selector];
  const markers = [];
  const map = {
    events: {},
    setView(center, zoom) { this.lastView = {center, zoom}; return this; },
    getZoom() { return 12; },
    getCenter() { return {lat: 24.5, lng: 39.6}; },
    invalidateSize() { this.resized = (this.resized || 0) + 1; },
    on(name, fn) { this.events[name] = fn; return this; },
    removeLayer() {}
  };
  const layer = () => ({
    events: {},
    addTo() { return this; },
    on(name, fn) { this.events[name] = fn; return this; },
    bindTooltip(content, options) { this.tooltip = {content, options, getElement: () => null}; return this; },
    getTooltip() { return this.tooltip; }
  });
  const tiles = layer();
  const L = {
    map: () => map,
    tileLayer: () => tiles,
    divIcon: () => ({}),
    circleMarker: layer,
    marker(_coordinates, options) {
      const marker = layer();
      marker.title = options.title;
      markers.push(marker);
      return marker;
    }
  };
  const opened = [];
  const documentEvents = {};
  const context = vm.createContext({
    L, URLSearchParams, navigator: {geolocation},
    window: {open: (...args) => opened.push(args), requestAnimationFrame: callback => callback()},
    document: {
      body: new Element(),
      addEventListener: (type, handler) => { documentEvents[type] = handler; },
      importNode: () => new Element(),
      createElement: () => new Element(),
      createDocumentFragment: () => new Element()
    }
  });
  vm.runInContext(script, context);
  context.renderNearby(container, {content: {}}, places);
  return {context, fields, map, tiles, markers, opened, documentEvents};
}

test('supplied locations exclude Tooba and validate coordinate pairs', () => {
  const mapped = places.filter(place => place.latitude !== undefined);
  assert.equal(mapped.length, 27);
  assert.equal(places.find(place => place.slug === 'tooba').latitude, undefined);
  const expected = [
    ['quba', 24.439391, 39.617301], ['jummah', 24.445500, 39.615288],
    ['qiblatain', 24.484122, 39.578956], ['ghamama', 24.465765, 39.606981],
    ['saqia', 24.460843, 39.600129], ['umar', 24.464259, 39.606682],
    ['kab-ashraf', 24.418735, 39.633598], ['shaykhain', 24.505694, 39.718665],
    ['uhud', 24.521770, 39.626006], ['ruma', 24.502072, 39.612284],
    ['fasih', 24.509994, 39.612860], ['rayah', 24.480303, 39.603433],
    ['sabah', 24.476696, 39.596239], ['fath', 24.477839, 39.595611],
    ['utban', 24.446456, 39.620025], ['banu-unaif', 24.435684, 39.615452],
    ['mustarah', 24.473204, 39.597243], ['abuzar-ghifari', 24.475697, 39.614533],
    ['ijaba', 24.471927, 39.618423], ['banu-zafar', 24.467610, 39.621740],
    ['al-sabq', 24.473303, 39.604986], ['saqifah-bani-saedah', 24.470285, 39.606793],
    ['minarteen', 24.455437, 39.593489], ['ares-well', 24.438895, 39.616645],
    ['uthman-farm-well', 24.494549, 39.578566], ['ghars-well', 24.445028, 39.627196],
    ['khaake-shifa', 24.448060, 39.623774]
  ];
  assert.deepEqual(mapped.map(({slug, latitude, longitude}) => [slug, latitude, longitude]), expected);
  const {context} = setup();
  assert.equal(context.validCoordinates(90, 0), false);
  assert.equal(context.validCoordinates(0, 181), false);
  assert.ok(Math.abs(context.straightLineKm({latitude: 0, longitude: 0}, {latitude: 0, longitude: 1}) - 111.2) < 0.1);
});

test('manual origin sorts results and both links and pins use that origin for directions', () => {
  const {fields, map, markers, opened} = setup();
  assert.equal(markers.length, 27);
  assert.equal(markers[0].tooltip.content.textContent, 'Masjid Quba');
  assert.equal(markers[0].tooltip.options.permanent, true);
  assert.equal(fields['[data-field="results"]'].children.length, 0);
  markers[0].events.click();
  assert.match(fields['[data-field="origin-status"]'].textContent, /Choose a location first/);
  map.events.click({latlng: {lat: 24.439391, lng: 39.617301}});
  const results = fields['[data-field="results"]'];
  assert.equal(results.children[0].children.length, 5);
  const first = results.children[0].children[0].children[0];
  assert.match(first.textContent, /Masjid Quba — 0.0 km straight-line/);
  const url = new URL(first.href);
  assert.equal(url.searchParams.get('origin'), '24.439391,39.617301');
  assert.equal(url.searchParams.get('destination'), '24.439391,39.617301');
  const mapElement = fields['[data-field="map"]'];
  mapElement.events.keydown({target: mapElement, key: 'Enter', preventDefault() {}});
  const nearest = places.filter(place => place.latitude !== undefined)
    .map(place => ({place, distance: Math.hypot(place.latitude - 24.5, (place.longitude - 39.6) * Math.cos(24.5 * Math.PI / 180))}))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5).map(({place}) => place.name);
  assert.deepEqual(results.children[0].children.map(item => item.children[0].textContent.split(' — ')[0]), nearest);
  markers[0].events.click();
  assert.equal(new URL(opened[0][0]).searchParams.get('origin'), '24.5,39.6');
});

test('overlapping place labels are hidden and reappear after moving apart', () => {
  const {map, markers} = setup();
  const first = {style: {}, getBoundingClientRect: () => ({left: 0, right: 80, top: 0, bottom: 25})};
  let secondLeft = 40;
  const second = {style: {}, getBoundingClientRect: () => ({left: secondLeft, right: secondLeft + 80, top: 0, bottom: 25})};
  markers[0].tooltip.getElement = () => first;
  markers[1].tooltip.getElement = () => second;
  map.events['zoomend moveend']();
  assert.equal(first.style.visibility, 'visible');
  assert.equal(second.style.visibility, 'hidden');
  secondLeft = 100;
  map.events['zoomend moveend']();
  assert.equal(second.style.visibility, 'visible');
});

test('fullscreen fallback opens and Escape restores the map', async () => {
  const {context, fields, map, documentEvents} = setup();
  const button = fields['[data-action="fullscreen"]'];
  const frame = fields['[data-field="map-frame"]'];
  await button.events.click();
  assert.equal(frame.classes.has('is-fullscreen'), true);
  assert.equal(context.document.body.classes.has('nearby-fullscreen-open'), true);
  assert.equal(button.textContent, 'Exit full screen');
  assert.equal(button.attributes['aria-pressed'], 'true');
  assert.equal(frame.attributes['aria-modal'], 'true');
  assert.equal(map.resized, 1);
  assert.deepEqual(map.lastView, {center: {lat: 24.5, lng: 39.6}, zoom: 12});
  documentEvents.keydown({key: 'Escape', preventDefault() {}});
  assert.equal(frame.classes.has('is-fullscreen'), false);
  assert.equal(context.document.body.classes.has('nearby-fullscreen-open'), false);
  assert.equal(button.textContent, 'Full screen');
  assert.equal(button.attributes['aria-pressed'], 'false');
  assert.equal(frame.attributes['aria-modal'], undefined);
  assert.equal(button.focused, true);
  assert.equal(map.resized, 2);
  assert.deepEqual(map.lastView, {center: {lat: 24.5, lng: 39.6}, zoom: 12});
});

test('fullscreen falls back to viewport mode when the native request fails', async () => {
  const {fields} = setup();
  const button = fields['[data-action="fullscreen"]'];
  const frame = fields['[data-field="map-frame"]'];
  frame.requestFullscreen = async () => { throw new Error('Fullscreen unavailable'); };
  await button.events.click();
  assert.equal(frame.classes.has('is-fullscreen'), true);
  assert.equal(button.textContent, 'Exit full screen');
});

test('native fullscreen enters and exits through fullscreenchange', async () => {
  const {context, fields, map, documentEvents} = setup();
  const button = fields['[data-action="fullscreen"]'];
  const frame = fields['[data-field="map-frame"]'];
  frame.requestFullscreen = async () => {
    context.document.fullscreenElement = frame;
    documentEvents.fullscreenchange();
  };
  context.document.exitFullscreen = async () => {
    context.document.fullscreenElement = null;
    documentEvents.fullscreenchange();
  };
  await button.events.click();
  assert.equal(button.textContent, 'Exit full screen');
  assert.equal(frame.classes.has('is-fullscreen'), false);
  await button.events.click();
  assert.equal(button.textContent, 'Full screen');
  assert.equal(map.resized, 2);
});

test('geolocation errors preserve manual fallback and a stale response cannot override it', () => {
  let success;
  let failure;
  const {fields, map, tiles} = setup({getCurrentPosition(ok, fail) { success = ok; failure = fail; }});
  const locate = fields['[data-action="locate"]'];
  locate.events.click();
  failure({code: 1});
  assert.match(fields['[data-field="origin-status"]'].textContent, /denied.*map/i);
  locate.events.click();
  map.events.click({latlng: {lat: 24.4, lng: 39.6}});
  success({coords: {latitude: 1, longitude: 2}});
  assert.match(fields['[data-field="origin-status"]'].textContent, /24.40000, 39.60000/);
  tiles.events.tileerror();
  assert.match(fields['[data-field="tile-status"]'].textContent, /could not be loaded/);
  const unavailable = setup();
  unavailable.fields['[data-action="locate"]'].events.click();
  assert.match(unavailable.fields['[data-field="origin-status"]'].textContent, /unavailable/);
  locate.events.click();
  success({coords: {latitude: 24.5, longitude: 39.7}});
  assert.match(fields['[data-field="origin-status"]'].textContent, /Current location: 24.50000, 39.70000/);
});
