'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const script = fs.readFileSync('site.js', 'utf8').replace(/\nsetupInstall\(\);\nstart\(\);\s*$/, '');

function setup({standalone = false, iosStandalone = false} = {}) {
  const elements = Object.fromEntries(['install-button', 'install-dialog', 'install-status']
    .map(id => [id, {
      hidden: id === 'install-button',
      open: false,
      textContent: '',
      events: {},
      focus() { this.focused = true; },
      showModal() { this.open = true; },
      close() { this.open = false; this.events.close(); },
      addEventListener(type, handler) { this.events[type] = handler; }
    }]));
  const events = {};
  const display = {matches: standalone, addEventListener(type, handler) { this[type] = handler; }};
  const context = vm.createContext({
    URL, URLSearchParams, navigator: {standalone: iosStandalone},
    document: {getElementById: id => elements[id] || null},
    window: {
      matchMedia: () => display,
      addEventListener(type, handler) { events[type] = handler; }
    }
  });
  vm.runInContext(script, context);
  context.testLocale = JSON.parse(fs.readFileSync('locales/en.json'));
  vm.runInContext('locale = testLocale', context);
  context.setupInstall();
  return {elements, events, display};
}

test('manifest and icons support project-relative standalone installation', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest'));
  const url = 'https://example.com/ziyarat/manifest.webmanifest';
  assert.equal(new URL(manifest.start_url, url).href, 'https://example.com/ziyarat/');
  assert.equal(new URL(manifest.scope, url).href, 'https://example.com/ziyarat/');
  assert.equal(new URL(manifest.id, url).href, 'https://example.com/ziyarat/');
  assert.equal(manifest.display, 'standalone');
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(item => item.sizes === `${size}x${size}`);
    assert.ok(icon);
    const bytes = fs.readFileSync(icon.src);
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
    assert.equal(new URL(icon.src, url).pathname, `/ziyarat/${icon.src}`);
  }
  for (const page of ['index.html', 'place.html', 'nearby/index.html']) {
    assert.match(fs.readFileSync(page, 'utf8'), /rel="manifest" href="manifest\.webmanifest"/);
  }
});

test('install action opens and closes manual install instructions', async () => {
  const {elements} = setup();
  const button = elements['install-button'], dialog = elements['install-dialog'];
  assert.equal(button.hidden, false);
  assert.equal(dialog.open, false);
  await button.events.click();
  assert.equal(dialog.open, true);
  dialog.close();
  assert.equal(dialog.open, false);
  assert.equal(button.focused, true);
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /Safari, tap Share, then Add to Home Screen/);
  assert.match(html, /aria-label="Install app"/);
  assert.match(html, /<dialog[^>]+aria-labelledby="install-title"/);
  assert.match(html, /<form method="dialog">/);
});

test('install action uses the browser prompt and hides after installation', async () => {
  const {elements, events} = setup();
  let prevented = false, prompted = 0;
  events.beforeinstallprompt({
    preventDefault() { prevented = true; },
    async prompt() { prompted++; },
    userChoice: Promise.resolve({outcome: 'accepted'})
  });
  await elements['install-button'].events.click();
  assert.equal(prevented, true);
  assert.equal(prompted, 1);
  assert.equal(elements['install-button'].disabled, false);
  events.appinstalled();
  assert.equal(elements['install-button'].hidden, true);
  let suppressed = false;
  events.beforeinstallprompt({preventDefault() { suppressed = true; }});
  assert.equal(suppressed, false);
});

test('install failure is visible and standalone apps do not show install controls', async () => {
  const {elements, events, display} = setup();
  events.beforeinstallprompt({
    preventDefault() {},
    async prompt() { throw new Error('unavailable'); }
  });
  await elements['install-button'].events.click();
  assert.match(elements['install-status'].textContent, /Could not open/);
  assert.equal(elements['install-dialog'].open, true);
  assert.equal(elements['install-button'].disabled, false);
  display.matches = true;
  display.change();
  assert.equal(elements['install-button'].hidden, true);
  assert.equal(elements['install-dialog'].open, false);
  assert.equal(setup({iosStandalone: true}).elements['install-button'].hidden, true);
});
