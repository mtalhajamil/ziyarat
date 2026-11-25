#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const SHEET_ID = '1G3PnLMbtYrHYhonAiqSwSitw8SHZHFwZns_lu-v2q9Q';
const TABS = {
  madinah: {gid: '0', prefix: 'MED'},
  makkah: {gid: '451182950', prefix: 'MAK'},
  badr: {gid: '213216835', prefix: 'BDR'}
};

function parseCsv(input) {
  const rows = [];
  let row = [], cell = '', quoted = false, closed = false, started = false;
  const finishCell = () => { row.push(cell); cell = ''; closed = false; started = false; };
  const finishRow = () => { finishCell(); rows.push(row); row = []; };
  input = input.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += ch;
    } else if (ch === ',') {
      finishCell();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      finishRow();
    } else if (ch === '"') {
      if (started || closed) throw new Error('Malformed CSV quote.');
      quoted = true;
      started = true;
    } else {
      if (closed) throw new Error('Malformed CSV after closing quote.');
      cell += ch;
      started = true;
    }
  }
  if (quoted) throw new Error('Malformed CSV: unclosed quote.');
  if (started || closed || row.length) finishRow();
  return rows;
}

function mapUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid Google Maps URL.'); }
  const valid = ((['google.com', 'www.google.com', 'goo.gl'].includes(url.hostname) &&
    (url.pathname === '/maps' || url.pathname.startsWith('/maps/'))) ||
    ['maps.google.com', 'maps.app.goo.gl'].includes(url.hostname));
  if (url.protocol !== 'https:' || !valid || url.username || url.password) {
    throw new Error('Invalid Google Maps URL.');
  }
}

function videoUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Invalid YouTube URL.'); }
  const valid = (url.hostname === 'youtu.be' && url.pathname.length > 1) ||
    (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname) &&
      (/^\/(?:shorts|embed)\/[^/]+\/?$/.test(url.pathname) ||
       (url.pathname === '/watch' && url.searchParams.has('v'))));
  if (url.protocol !== 'https:' || !valid || url.username || url.password) {
    throw new Error('Invalid YouTube URL.');
  }
}

function planSync(csvs, originalDocuments) {
  const documents = structuredClone(originalDocuments);
  const changes = [], warnings = [];
  for (const [destination, tab] of Object.entries(TABS)) {
    const document = documents[destination];
    if (!document || document.id !== destination || !Array.isArray(document.places)) {
      throw new Error(`Invalid ${destination} destination data.`);
    }
    const indexed = new Map();
    for (const place of document.places) {
      if (typeof place.sourceCode !== 'string' ||
          !new RegExp(`^${tab.prefix}-[A-Z0-9]+(?:-[A-Z0-9]+)*$`).test(place.sourceCode) ||
          indexed.has(place.sourceCode)) {
        throw new Error(`Missing, invalid or duplicate ${destination} source code.`);
      }
      indexed.set(place.sourceCode, place);
    }
    if (typeof csvs[destination] !== 'string') throw new Error(`Missing ${destination} CSV.`);
    const rows = parseCsv(csvs[destination]);
    const headers = ['Name', 'Location', 'Latitude', 'Longitude', 'Video Link', 'Description'];
    const matches = rows.map((row, index) => ({row, index})).filter(({row}) =>
      row.some(cell => ['Code', 'Site Code'].includes(cell.trim())) &&
      headers.every(header => row.some(cell => cell.trim() === header)));
    if (matches.length !== 1) throw new Error(`Missing or ambiguous ${destination} header.`);
    const {row: header, index: headerIndex} = matches[0];
    const positions = {};
    for (const key of ['Code', ...headers]) {
      const indices = header.map((cell, index) => ({cell: cell.trim(), index}))
        .filter(item => key === 'Code' ? ['Code', 'Site Code'].includes(item.cell) : item.cell === key);
      if (indices.length !== 1) throw new Error(`Ambiguous ${destination} column: ${key}.`);
      positions[key] = indices[0].index;
    }
    const seen = new Set();
    for (let index = headerIndex + 1; index < rows.length; index++) {
      const row = rows[index];
      const get = key => (row[positions[key]] ?? '').trim();
      const code = get('Code');
      if (!code && ['Name', 'Location', 'Latitude', 'Longitude', 'Video Link', 'Description'].every(key => !get(key))) continue;
      if (!new RegExp(`^${tab.prefix}-[A-Z0-9]+(?:-[A-Z0-9]+)*$`).test(code)) {
        throw new Error(`Invalid or missing ${destination} code at CSV row ${index + 1}.`);
      }
      if (seen.has(code)) throw new Error(`Duplicate sheet code: ${code}.`);
      seen.add(code);
      const place = indexed.get(code);
      if (!place) throw new Error(`Unknown sheet code: ${code}. Add the site and code explicitly first.`);
      const set = (field, value) => {
        if (place[field] !== value) {
          changes.push({destination, code, field, before: place[field], after: value});
          place[field] = value;
        }
      };
      const name = get('Name'), location = get('Location'), video = get('Video Link');
      const latitude = get('Latitude'), longitude = get('Longitude'), description = get('Description');
      if (name) {
        if (/[\r\n\x00-\x1f]/.test(name)) throw new Error(`Invalid name for ${code}.`);
        set('name', name);
      }
      if (location) {
        mapUrl(location);
        if (code === 'MED-TOOBA' && location === 'https://maps.app.goo.gl/YgwShjVqZ6WFkkXs9') {
          warnings.push(`${code}: ignored known incorrect Karachi map link.`);
        } else set('mapUrl', location);
      }
      if (video) { videoUrl(video); set('videoUrl', video); }
      if (Boolean(latitude) !== Boolean(longitude)) throw new Error(`Incomplete coordinates for ${code}.`);
      if (latitude && longitude) {
        const decimal = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
        const lat = Number(latitude), lon = Number(longitude);
        if (!decimal.test(latitude) || !decimal.test(longitude) ||
            !Number.isFinite(lat) || Math.abs(lat) > 85 || !Number.isFinite(lon) || Math.abs(lon) > 180) {
          throw new Error(`Invalid coordinates for ${code}.`);
        }
        if (code === 'MED-TOOBA') {
          if (lat === 24.84332 && lon === 67.054165) {
            warnings.push(`${code}: ignored known Karachi coordinates.`);
          } else {
            throw new Error('MED-TOOBA coordinates require independent review before adding a nearby pin.');
          }
        } else {
          set('latitude', lat);
          set('longitude', lon);
        }
      }
      if (description && !/\p{Script=Arabic}/u.test(description)) {
        throw new Error(`Description language for ${code} is unclear; review it before importing.`);
      }
      const normalized = value => value.normalize('NFC').replace(/\s+/gu, ' ').trim();
      if (description && (typeof place.urdu !== 'string' ||
          normalized(place.urdu) !== normalized(description))) {
        if (place.english) warnings.push(`${code}: review the existing English translation after the Urdu text changes.`);
        set('urdu', description);
      }
      if ((place.latitude !== undefined || place.longitude !== undefined) &&
          (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude) ||
           Math.abs(place.latitude) > 85 || Math.abs(place.longitude) > 180 || !place.mapUrl)) {
        throw new Error(`Mapped place ${code} requires valid coordinates and a Google Maps URL.`);
      }
    }
    if (!seen.size) throw new Error(`No site rows in ${destination} sheet.`);
  }
  return {documents, changes, warnings};
}

function writeDocuments(plan, originals, root = ROOT) {
  const staged = [], replaced = [];
  try {
    for (const destination of new Set(plan.changes.map(change => change.destination))) {
      const target = path.join(root, 'data', `${destination}.json`);
      if (fs.readFileSync(target, 'utf8') !== originals[destination]) {
        throw new Error(`${destination}.json changed during sync; nothing was applied.`);
      }
      const temp = `${target}.${randomUUID()}.tmp`;
      const updated = JSON.stringify(plan.documents[destination], null, 2) + '\n';
      const fd = fs.openSync(temp, 'wx');
      staged.push({destination, target, temp, updated});
      try { fs.writeFileSync(fd, updated); } finally { fs.closeSync(fd); }
    }
    for (const item of staged) {
      if (fs.readFileSync(item.target, 'utf8') !== originals[item.destination]) {
        throw new Error(`${item.destination}.json changed during sync.`);
      }
      fs.renameSync(item.temp, item.target);
      replaced.push(item);
    }
  } catch (error) {
    const failures = [];
    for (const item of replaced.reverse()) {
      try {
        if (fs.readFileSync(item.target, 'utf8') !== item.updated) {
          throw new Error('file changed after sync; refusing to overwrite it');
        }
        fs.writeFileSync(item.target, originals[item.destination]);
      }
      catch (rollbackError) { failures.push(`${item.target}: ${rollbackError.message}`); }
    }
    if (failures.length) throw new Error(`${error.message} Rollback failed: ${failures.join('; ')}`);
    throw error;
  } finally {
    for (const item of staged) {
      if (fs.existsSync(item.temp)) fs.unlinkSync(item.temp);
    }
  }
}

async function main(args) {
  if (args.length > 1 || (args.length && !['--dry-run', '--apply'].includes(args[0]))) {
    throw new Error('Usage: node scripts/update-from-sheet.cjs [--dry-run | --apply]');
  }
  const apply = args[0] === '--apply';
  const originals = {}, documents = {}, csvs = {};
  for (const destination of Object.keys(TABS)) {
    originals[destination] = fs.readFileSync(path.join(ROOT, 'data', `${destination}.json`), 'utf8');
    documents[destination] = JSON.parse(originals[destination]);
  }
  for (const [destination, {gid}] of Object.entries(TABS)) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
    const response = await fetch(url, {signal: AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`Could not fetch ${destination} sheet (HTTP ${response.status}).`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('text/csv')) throw new Error(`Unexpected ${destination} sheet response: ${contentType}.`);
    csvs[destination] = await response.text();
    if (csvs[destination].length > 5_000_000) throw new Error(`${destination} sheet is too large.`);
  }
  const plan = planSync(csvs, documents);
  for (const warning of plan.warnings) console.warn(`Warning: ${warning}`);
  for (const change of plan.changes) {
    const before = change.before === undefined ? '' : String(change.before);
    const after = String(change.after);
    let first = 0;
    while (first < before.length && first < after.length && before[first] === after[first]) first++;
    const show = value => JSON.stringify((first > 35 ? '…' : '') + value.slice(Math.max(0, first - 35), first + 90) +
      (value.length > first + 90 ? '…' : ''));
    console.log(`${change.destination} ${change.code} ${change.field}: ${show(before)} -> ${show(after)}`);
  }
  console.log(`${apply ? 'Applying' : 'Dry run:'} ${plan.changes.length} field change(s).`);
  if (apply) writeDocuments(plan, originals);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    console.error(`Sheet sync failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {parseCsv, planSync, writeDocuments};
