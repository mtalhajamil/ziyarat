'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {parseCsv, planSync, writeDocuments} = require('../scripts/update-from-sheet.cjs');

const header = '#,Code,Name,Location,Latitude,Longitude,Video Link,Description\r\n';
const row = (code, name, url = '', latitude = '', longitude = '', video = '', description = '') =>
  ['1', code, name, url, latitude, longitude, video, description]
    .map(value => `"${value.replaceAll('"', '""')}"`).join(',') + '\r\n';
const docs = () => ({
  madinah: {id: 'madinah', theme: {color: 'keep'}, places: [
    {sourceCode: 'MED-QUBA', slug: 'quba', name: 'Old name', mapUrl: 'https://maps.app.goo.gl/old',
      latitude: 24.4, longitude: 39.6, urdu: 'Old text', english: 'Keep translation', image: {src: 'keep'}},
    {sourceCode: 'MED-TOOBA', slug: 'tooba', name: 'Tooba'}
  ]},
  makkah: {id: 'makkah', places: [{sourceCode: 'MAK-A', slug: 'a', name: 'A'}]},
  badr: {id: 'badr', places: [{sourceCode: 'BDR-A', slug: 'a', name: 'A'}]}
});
const csvs = (madinah) => ({
  madinah: 'Decorative title,,,,,,,\r\n' + header + madinah,
  makkah: header + row('MAK-A', 'A'),
  badr: header.replace('Code', 'Site Code') + row('BDR-A', 'A')
});

test('CSV parser preserves quotes, multiline Urdu and trailing empty fields', () => {
  assert.deepEqual(parseCsv('\uFEFFa,b,c\r\n"line 1\nline ""2""",سلام,\r\n'), [
    ['a', 'b', 'c'], ['line 1\nline "2"', 'سلام', '']
  ]);
  for (const invalid of ['a,"unfinished', 'a,b"bad', '"a"x,b']) {
    assert.throws(() => parseCsv(invalid), /CSV/);
  }
});

test('sync joins by code, preserves unmanaged and blank fields, and does not mutate inputs', () => {
  const data = docs();
  const input = row('MED-TOOBA', 'Tooba') +
    row('MED-QUBA', 'New name', 'https://maps.app.goo.gl/new', '24.45', '39.62', '', 'پہلی سطر\n"دوسری"');
  const plan = planSync(csvs(input), data);
  const place = plan.documents.madinah.places[0];
  assert.equal(place.name, 'New name');
  assert.equal(place.mapUrl, 'https://maps.app.goo.gl/new');
  assert.equal(place.latitude, 24.45);
  assert.equal(place.longitude, 39.62);
  assert.equal(place.urdu, 'پہلی سطر\n"دوسری"');
  assert.equal(place.english, 'Keep translation');
  assert.deepEqual(place.image, {src: 'keep'});
  assert.equal(place.slug, 'quba');
  assert.deepEqual(plan.documents.madinah.theme, {color: 'keep'});
  assert.equal(data.madinah.places[0].name, 'Old name');
  assert.ok(plan.changes.some(change => change.code === 'MED-QUBA' && change.field === 'urdu'));
  const blank = planSync(csvs(row('MED-QUBA', '', '', '', '', '', '')), data);
  assert.deepEqual(blank.documents.madinah.places[0], data.madinah.places[0]);
  assert.equal(blank.documents.madinah.places.length, 2);
  data.madinah.places[0].urdu = 'پہلی سطر\n\nدوسری';
  const formatting = planSync(csvs(row('MED-QUBA', '', '', '', '', '', 'پہلی سطر   دوسری')), data);
  assert.equal(formatting.documents.madinah.places[0].urdu, 'پہلی سطر\n\nدوسری');
  data.madinah.places[0].urdu = 'اَلْحَمْدُ لِلَّٰهِ';
  const unicode = planSync(csvs(row('MED-QUBA', '', '', '', '', '', 'اَلْحَمْدُ لِلَّٰهِ')), data);
  assert.equal(unicode.documents.madinah.places[0].urdu, data.madinah.places[0].urdu);
});

test('invalid sheets fail before any data is returned', () => {
  const data = docs();
  for (const text of [
    row('MED-QUBA', 'Quba') + row('MED-QUBA', 'Duplicate'),
    row('MED-UNKNOWN', 'Unknown'),
    row('MED-QUBA', 'Quba', 'https://example.com/'),
    row('MED-QUBA', 'Quba', '', '24.4', ''),
    row('MED-QUBA', 'Quba', '', 'garbage', '39.6'),
    row('MED-TOOBA', 'Tooba', '', '24.4', '39.6'),
    row('MED-QUBA', 'Quba', '', '', '', '', 'English description'),
    row('MED-QUBA', 'Quba', '', '', '', 'https://example.com/video'),
    row('MED-QUBA', 'Quba') + row('', 'Uncoded place')
  ]) {
    assert.throws(() => planSync(csvs(text), data));
    assert.equal(data.madinah.places[0].name, 'Old name');
  }
  assert.throws(() => planSync({...csvs(row('MED-QUBA', 'Quba')), makkah: 'bad header\n'}, data), /header/i);
});

test('Tooba never silently regains the known Karachi location', () => {
  const input = row('MED-TOOBA', 'Tooba', 'https://maps.app.goo.gl/YgwShjVqZ6WFkkXs9', '24.843320', '67.054165');
  const plan = planSync(csvs(input), docs());
  const tooba = plan.documents.madinah.places[1];
  assert.equal(tooba.mapUrl, undefined);
  assert.equal(tooba.latitude, undefined);
  assert.equal(tooba.longitude, undefined);
  assert.ok(plan.warnings.length);
  assert.throws(() => planSync(csvs(row('MED-TOOBA', 'Tooba', '', '24.4', '39.6')), docs()), /Tooba.*review/i);
});

test('apply writes only validated changes and detects concurrent edits', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ziyarat-sheet-'));
  t.after(() => {
    for (const name of ['madinah', 'makkah', 'badr']) fs.unlinkSync(path.join(root, 'data', `${name}.json`));
    fs.rmdirSync(path.join(root, 'data'));
    fs.rmdirSync(root);
  });
  fs.mkdirSync(path.join(root, 'data'));
  const data = docs();
  const originals = Object.fromEntries(Object.entries(data).map(([name, value]) => {
    const text = JSON.stringify(value, null, 2) + '\n';
    fs.writeFileSync(path.join(root, 'data', `${name}.json`), text);
    return [name, text];
  }));
  const plan = planSync(csvs(row('MED-QUBA', 'New name')), data);
  fs.writeFileSync(path.join(root, 'data', 'madinah.json'), 'external edit');
  assert.throws(() => writeDocuments(plan, originals, root), /changed during sync/);
  assert.equal(fs.readFileSync(path.join(root, 'data', 'madinah.json'), 'utf8'), 'external edit');
  fs.writeFileSync(path.join(root, 'data', 'madinah.json'), originals.madinah);
  writeDocuments(plan, originals, root);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'data', 'madinah.json'))).places[0].name, 'New name');
  assert.equal(fs.readFileSync(path.join(root, 'data', 'makkah.json'), 'utf8'), originals.makkah);
});
