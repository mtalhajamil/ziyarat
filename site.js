'use strict';

async function loadResource(path, type) {
  const response = await fetch(path, {cache: 'no-cache'});
  if (!response.ok) {
    throw new Error(`Could not load ${path} (HTTP ${response.status}).`);
  }
  return type === 'json' ? response.json() : response.text();
}

function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing or invalid ${field}.`);
  }
  return value;
}

function validateImage(image) {
  if (!image || typeof image !== 'object' ||
      typeof image.src !== 'string' ||
      !/^assets\/images\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|svg)$/.test(image.src) ||
      !Number.isInteger(image.width) || image.width <= 0 ||
      !Number.isInteger(image.height) || image.height <= 0) {
    throw new Error('Invalid local image or image dimensions.');
  }
  requireText(image.alt, 'image alt text');
}

function setImage(element, image) {
  element.src = image.src;
  element.alt = image.alt;
  element.width = image.width;
  element.height = image.height;
}

function field(fragment, name) {
  const element = fragment.querySelector(`[data-field="${name}"]`);
  if (!element) throw new Error(`Missing template field: ${name}.`);
  return element;
}

function getTemplate(document, id) {
  const template = document.getElementById(id);
  if (!template || template.tagName !== 'TEMPLATE') {
    throw new Error(`Missing template: ${id}.`);
  }
  return template;
}

function renderDestinations(container, template, destinations) {
  if (!Array.isArray(destinations) || destinations.length === 0) {
    throw new Error('Destination data must contain at least one destination.');
  }
  const cards = document.createDocumentFragment();
  for (const destination of destinations) {
    requireText(destination.name, 'destination name');
    validateImage(destination.image);
    if (destination.page !== undefined &&
        (typeof destination.page !== 'string' ||
          !/^(?:(?:[a-z0-9-]+\/)+|[a-z0-9-]+\.html)$/.test(destination.page))) {
      throw new Error('Invalid destination page.');
    }

    const card = document.importNode(template.content, true);
    const name = field(card, 'name');
    name.textContent = destination.name;
    setImage(field(card, 'image'), destination.image);
    const status = field(card, 'status');
    if (destination.page) {
      const link = document.createElement('a');
      link.className = 'destination-link';
      link.href = destination.page;
      link.textContent = destination.name;
      name.replaceChildren(link);
      status.hidden = true;
    } else {
      status.textContent = 'Coming soon';
    }
    cards.append(card);
  }
  container.replaceChildren(cards);
}

function renderPlaces(container, template, places) {
  if (!Array.isArray(places) || places.length === 0) {
    throw new Error('Place data must contain at least one place.');
  }
  const slugs = new Set();
  for (const place of places) {
    if (typeof place.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(place.slug) ||
        slugs.has(place.slug)) {
      throw new Error('Invalid or duplicate place slug.');
    }
    slugs.add(place.slug);
    requireText(place.name, 'place name');
    validateImage(place.image);
    requireText(place.english, 'English description');
    requireText(place.urdu, 'Urdu description');
    const map = new URL(requireText(place.mapUrl, 'map URL'));
    const isGoogleMaps = (
      (['google.com', 'www.google.com', 'goo.gl'].includes(map.hostname) &&
        (map.pathname === '/maps' || map.pathname.startsWith('/maps/'))) ||
      ['maps.google.com', 'maps.app.goo.gl'].includes(map.hostname)
    );
    if (map.protocol !== 'https:' || !isGoogleMaps || map.username || map.password) {
      throw new Error('Map URL must be a Google Maps HTTPS link.');
    }
  }

  const content = document.importNode(template.content, true);
  const name = field(content, 'name');
  const image = field(content, 'image');
  const map = field(content, 'map');
  const english = field(content, 'english');
  const urdu = field(content, 'urdu');
  const previous = content.querySelector('[data-action="previous"]');
  const next = content.querySelector('[data-action="next"]');
  if (!previous || !next) throw new Error('Missing place navigation controls.');
  const slug = container.dataset.placeSlug;
  const index = slug ? places.findIndex(place => place.slug === slug) : 0;
  if (index === -1) throw new Error(`Unknown place: ${slug}.`);

  function navigateTo(placeIndex) {
    const path = `madinah/${places[placeIndex].slug}/`;
    window.location.assign(new URL(path, document.baseURI).href);
  }

  const place = places[index];
  name.textContent = place.name;
  setImage(image, place.image);
  map.href = place.mapUrl;
  english.textContent = place.english;
  urdu.textContent = place.urdu;
  previous.disabled = places.length === 1;
  next.disabled = places.length === 1;
  previous.addEventListener('click', () => {
    navigateTo((index + places.length - 1) % places.length);
  });
  next.addEventListener('click', () => {
    navigateTo((index + 1) % places.length);
  });
  container.replaceChildren(content);
}

async function start() {
  const status = document.getElementById('load-status');
  const destinations = document.getElementById('destination-list');
  const places = document.getElementById('place-content');
  status.textContent = 'Loading…';
  try {
    const [templateHtml, data] = await Promise.all([
      loadResource('templates.html', 'text'),
      loadResource(destinations ? 'data/destinations.json' : 'data/madinah.json', 'json')
    ]);
    const templates = new DOMParser().parseFromString(templateHtml, 'text/html');
    if (destinations) {
      renderDestinations(destinations, getTemplate(templates, 'destination-template'), data);
    } else if (places) {
      renderPlaces(places, getTemplate(templates, 'place-template'), data);
    } else {
      throw new Error('No content container found.');
    }
    status.textContent = '';
  } catch (error) {
    console.error('Unable to load site content:', error);
    status.textContent = 'Unable to load content. Please check your connection and try again.';
  }
}

start();
