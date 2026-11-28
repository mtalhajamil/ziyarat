'use strict';

let placeResizeHandler = null;
let locale = {};
let language = 'en';

function t(key, values = {}) {
  const message = requireText(locale[key], `locale key ${key}`);
  return message.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : match);
}

function translate(root) {
  for (const element of root.querySelectorAll('[data-i18n]')) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const attribute of ['aria-label', 'title']) {
    for (const element of root.querySelectorAll(`[data-i18n-${attribute}]`)) {
      element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`)));
    }
  }
}

function localizedName(item) {
  return language === 'ur' && item.urduName ? item.urduName : item.name;
}

async function setupLocale() {
  try {
    const saved = window.localStorage.getItem('ziyarat-language');
    if (saved === 'en' || saved === 'ur') language = saved;
  } catch (error) {
    console.warn('Language preference could not be read:', error);
  }
  locale = await loadResource(`locales/${language}.json`, 'json');
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ur' ? 'rtl' : 'ltr';
  translate(document);
  const menu = document.getElementById('language-menu');
  if (menu) {
    const summary = menu.querySelector('summary');
    for (const button of menu.querySelectorAll('[data-language]')) {
      const selectedLanguage = button.dataset.language;
      button.setAttribute('aria-pressed', String(selectedLanguage === language));
      button.addEventListener('click', () => {
        if (!['en', 'ur'].includes(selectedLanguage)) return;
        if (selectedLanguage === language) {
          menu.open = false;
          summary.focus();
          return;
        }
        try {
          window.localStorage.setItem('ziyarat-language', selectedLanguage);
          window.location.reload();
        } catch (error) {
          console.error('Language preference could not be saved:', error);
          document.getElementById('load-status').textContent = t('preferenceError');
        }
      });
    }
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.open) {
        menu.open = false;
        summary.focus();
      }
    });
  }
}

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

function validateMapUrl(value) {
  const map = new URL(requireText(value, 'map URL'));
  const isGoogleMaps = (
    (['google.com', 'www.google.com', 'goo.gl'].includes(map.hostname) &&
      (map.pathname === '/maps' || map.pathname.startsWith('/maps/'))) ||
    ['maps.google.com', 'maps.app.goo.gl'].includes(map.hostname)
  );
  if (map.protocol !== 'https:' || !isGoogleMaps || map.username || map.password) {
    throw new Error('Map URL must be a Google Maps HTTPS link.');
  }
}

function validateImage(image) {
  if (!image || typeof image !== 'object' ||
      typeof image.src !== 'string' ||
      !/^assets\/images\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(image.src) ||
      !Number.isInteger(image.width) || image.width <= 0 ||
      !Number.isInteger(image.height) || image.height <= 0) {
    throw new Error('Invalid local image or image dimensions.');
  }
  requireText(image.alt, 'image alt text');
  if (image.credit !== undefined) {
    if (!image.credit || typeof image.credit !== 'object') {
      throw new Error('Invalid image credit.');
    }
    requireText(image.credit.description, 'image credit description');
    requireText(image.credit.license, 'image license');
    for (const [label, value] of [['image source URL', image.credit.sourceUrl], ['image license URL', image.credit.licenseUrl]]) {
      const url = new URL(requireText(value, label));
      if (url.protocol !== 'https:' || url.username || url.password) {
        throw new Error(`Invalid ${label}.`);
      }
    }
  }
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
          destination.page !== `place.html?destination=${destination.id}` ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(destination.id))) {
      throw new Error('Invalid destination page.');
    }
    if (destination.description !== undefined) {
      requireText(destination.description, 'destination description');
    }

    const card = document.importNode(template.content, true);
    const name = field(card, 'name');
    name.textContent = localizedName(destination);
    setImage(field(card, 'image'), destination.image);
    const status = field(card, 'status');
    if (destination.page) {
      const link = document.createElement('a');
      link.className = 'destination-link';
      link.href = destination.page;
      link.textContent = localizedName(destination);
      name.replaceChildren(link);
      if (destination.description) {
        status.textContent = language === 'ur' && destination.urduDescription
          ? destination.urduDescription : destination.description;
      } else {
        status.hidden = true;
      }
    } else {
      status.textContent = t('comingSoon');
    }
    cards.append(card);
  }
  container.replaceChildren(cards);
}

function placeDestination(container) {
  const destination = container?.dataset.destination;
  if (typeof destination !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(destination)) {
    throw new Error('Unsupported place destination.');
  }
  return destination;
}

function applyDestinationTheme(theme) {
  const keys = [
    'text', 'secondary', 'disabled', 'accent', 'border', 'breadcrumb-border', 'breadcrumb-bg',
    'card-bg', 'details-bg', 'panel-bg', 'toggle-bg', 'image-bg', 'shadow', 'control',
    'control-hover', 'video', 'video-hover', 'glow-one', 'glow-two', 'background-color'
  ];
  if (!theme || typeof theme !== 'object' || Array.isArray(theme) ||
      Object.keys(theme).length !== keys.length) throw new Error('Invalid destination theme.');
  for (const key of keys) {
    const value = theme[key];
    if (typeof value !== 'string') throw new Error(`Missing theme color: ${key}.`);
    const rgba = value.match(/^rgba\(\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*(0(?:\.\d+)?|1(?:\.0+)?)\s*\)$/);
    const rgb = value.match(/^(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})$/);
    const validRgb = match => match && match.slice(1, 4).every(channel => Number(channel) <= 255);
    const valid = key === 'shadow' ? validRgb(rgb) : /^#[0-9a-f]{6}$/i.test(value) || validRgb(rgba);
    if (!valid) throw new Error(`Invalid theme color: ${key}.`);
  }
  for (const key of keys) document.body.style.setProperty(`--place-${key}`, theme[key]);
}

async function loadDestinations() {
  const ids = await loadResource('data/destinations.json', 'json');
  if (!Array.isArray(ids) || !ids.length ||
      ids.some(id => typeof id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) ||
      new Set(ids).size !== ids.length) {
    throw new Error('Invalid destination index.');
  }
  return Promise.all(ids.map(async id => {
    const destination = await loadResource(`data/${id}.json`, 'json');
    if (!destination || destination.id !== id) throw new Error(`Invalid destination: ${id}.`);
    return destination;
  }));
}

function setupCountries(container, templates, destinations, countries) {
  const selector = document.getElementById('country-select');
  if (!selector || !Array.isArray(countries) || !countries.length) throw new Error('Invalid country data.');
  const ids = new Set();
  for (const country of countries) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(country.id) || ids.has(country.id)) {
      throw new Error('Invalid or duplicate country.');
    }
    ids.add(country.id);
    requireText(country.name, 'country name');
    requireText(country.urduName, 'Urdu country name');
    if (Boolean(country.destinations) === Boolean(country.cities)) throw new Error('Invalid country cities.');
    const option = document.createElement('option');
    option.value = country.id;
    option.textContent = country.cities
      ? `${localizedName(country)} — ${t('comingSoon')}` : localizedName(country);
    selector.append(option);
  }
  function renderCountry() {
    const country = countries.find(item => item.id === selector.value);
    if (!country) throw new Error('Unknown country.');
    if (country.destinations) {
      if (!Array.isArray(country.destinations) || !country.destinations.length ||
          new Set(country.destinations).size !== country.destinations.length) throw new Error('Invalid country destinations.');
      const selected = country.destinations.map(id => {
        const destination = destinations.find(item => item.id === id);
        if (!destination) throw new Error(`Unknown country destination: ${id}.`);
        return destination;
      });
      renderDestinations(container, getTemplate(templates, 'destination-template'), selected);
    } else {
      if (!Array.isArray(country.cities) || !country.cities.length) throw new Error('Invalid country cities.');
      const cards = document.createDocumentFragment();
      const template = getTemplate(templates, 'city-template');
      for (const city of country.cities) {
        requireText(city.name, 'city name');
        requireText(city.urduName, 'Urdu city name');
        const card = document.importNode(template.content, true);
        field(card, 'name').textContent = localizedName(city);
        field(card, 'status').textContent = t('comingSoon');
        cards.append(card);
      }
      container.replaceChildren(cards);
    }
  }
  let savedCountry;
  try {
    savedCountry = window.localStorage.getItem('ziyarat-country');
  } catch (error) {
    console.warn('Country preference could not be read:', error);
  }
  selector.value = ids.has(savedCountry) ? savedCountry : countries[0].id;
  selector.addEventListener('change', () => {
    try {
      window.localStorage.setItem('ziyarat-country', selector.value);
    } catch (error) {
      console.warn('Country preference could not be saved:', error);
    }
    renderCountry();
  });
  renderCountry();
}

function renderPlaces(container, template, places, slug = container.dataset.placeSlug, animate = false) {
  const destination = placeDestination(container);
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
    if (place.image !== undefined) validateImage(place.image);
    if (place.english !== undefined) requireText(place.english, 'English description');
    if (place.urdu !== undefined) requireText(place.urdu, 'Urdu description');
    if (place.videoUrl !== undefined) {
      const video = new URL(requireText(place.videoUrl, 'video URL'));
      const validYouTubePath =
        (video.hostname === 'youtu.be' && video.pathname.length > 1) ||
        (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(video.hostname) &&
          (/^\/(?:shorts|embed)\/[^/]+\/?$/.test(video.pathname) ||
            (video.pathname === '/watch' && video.searchParams.has('v'))));
      if (video.protocol !== 'https:' || !validYouTubePath || video.username || video.password) {
        throw new Error('Video URL must be a YouTube HTTPS link.');
      }
    }
    if (place.mapUrl !== undefined) validateMapUrl(place.mapUrl);
  }

  const content = document.importNode(template.content, true);
  translate(content);
  const name = field(content, 'name');
  const image = field(content, 'image');
  const imagePlaceholder = field(content, 'image-placeholder');
  const credit = field(content, 'image-credit');
  const imageSource = field(content, 'image-source');
  const imageLicense = field(content, 'image-license');
  const map = field(content, 'map');
  const mapUnavailable = field(content, 'map-unavailable');
  const video = field(content, 'video');
  const english = field(content, 'english');
  const urdu = field(content, 'urdu');
  const englishMore = field(content, 'english-more');
  const urduMore = field(content, 'urdu-more');
  const descriptions = field(content, 'descriptions');
  const descriptionEmpty = field(content, 'description-empty');
  const previous = content.querySelector('[data-action="previous"]');
  const next = content.querySelector('[data-action="next"]');
  if (!previous || !next) throw new Error('Missing place navigation controls.');
  const index = slug ? places.findIndex(place => place.slug === slug) : 0;
  if (index === -1) throw new Error(`Unknown place: ${slug}.`);
  let initializeDescriptions = () => {};

  function navigateTo(placeIndex) {
    const nextPlace = places[placeIndex];
    const url = new URL('place.html', document.baseURI);
    url.searchParams.set('destination', destination);
    url.searchParams.set('place', nextPlace.slug);
    window.history.pushState({destination, slug: nextPlace.slug}, '', url.href);
    renderPlaces(container, template, places, nextPlace.slug, true);
  }

  const place = places[index];
  container.dataset.placeSlug = place.slug;
  document.title = `${localizedName(place)} | Ziyarat`;
  const currentBreadcrumb = document.querySelector('.breadcrumbs [aria-current="page"]');
  if (currentBreadcrumb) currentBreadcrumb.textContent = localizedName(place);
  name.textContent = localizedName(place);
  if (place.image) {
    setImage(image, place.image);
  } else {
    image.hidden = true;
    imagePlaceholder.hidden = false;
  }
  if (place.image && place.image.credit) {
    imageSource.textContent = place.image.credit.description;
    imageSource.href = place.image.credit.sourceUrl;
    imageLicense.textContent = place.image.credit.license;
    imageLicense.href = place.image.credit.licenseUrl;
    credit.hidden = false;
  }
  if (place.mapUrl) {
    map.href = place.mapUrl;
  } else {
    map.hidden = true;
    mapUnavailable.hidden = false;
  }
  if (place.videoUrl) {
    video.href = place.videoUrl;
    video.hidden = false;
    video.target = '_blank';
    video.rel = 'noopener noreferrer';
  } else {
    video.hidden = true;
  }
  const hasDescriptions = place.english !== undefined || place.urdu !== undefined;
  if (hasDescriptions) {
    english.textContent = place.english ?? t('englishSoon');
    urdu.textContent = place.urdu ?? t('urduSoon');
    const englishPanel = field(content, 'english-panel');
    const urduPanel = field(content, 'urdu-panel');
    const englishButton = field(content, 'language-en');
    const urduButton = field(content, 'language-ur');
    function preparePreview(panel, paragraph, button, moreLabel, lessLabel, moreText, lessText) {
      if (panel.hidden) return;
      const expanded = button.getAttribute('aria-expanded') === 'true';
      paragraph.dataset.collapsed = 'false';
      const lineHeight = Number.parseFloat(window.getComputedStyle(paragraph).lineHeight);
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        throw new Error('Could not measure description line height.');
      }
      const needsToggle = paragraph.scrollHeight > lineHeight * 3 + 1;
      button.hidden = !needsToggle;
      const keepExpanded = needsToggle && expanded;
      paragraph.dataset.collapsed = String(needsToggle && !keepExpanded);
      button.textContent = keepExpanded ? lessText : moreText;
      button.setAttribute('aria-expanded', String(keepExpanded));
      button.setAttribute('aria-label', keepExpanded ? lessLabel : moreLabel);
    }
    function bindPreview(paragraph, button, moreLabel, lessLabel, moreText, lessText) {
      button.addEventListener('click', () => {
        const expanded = button.getAttribute('aria-expanded') === 'true';
        paragraph.dataset.collapsed = String(expanded);
        button.setAttribute('aria-expanded', String(!expanded));
        button.textContent = expanded ? moreText : lessText;
        button.setAttribute('aria-label', expanded ? moreLabel : lessLabel);
      });
    }
    const enLabels = [t('showMoreDescription'), t('showLessDescription'), t('showMore'), t('showLess')];
    const urLabels = [t('urduShowMoreDescription'), t('urduShowLessDescription'), t('urduShowMore'), t('urduShowLess')];
    bindPreview(english, englishMore, ...enLabels);
    bindPreview(urdu, urduMore, ...urLabels);
    function setLanguage(language) {
      const isEnglish = language === 'en';
      englishPanel.hidden = !isEnglish;
      urduPanel.hidden = isEnglish;
      englishButton.ariaPressed = String(isEnglish);
      urduButton.ariaPressed = String(!isEnglish);
      preparePreview(
        isEnglish ? englishPanel : urduPanel,
        isEnglish ? english : urdu,
        isEnglish ? englishMore : urduMore,
        ...(isEnglish ? enLabels : urLabels)
      );
    }
    englishButton.addEventListener('click', () => setLanguage('en'));
    urduButton.addEventListener('click', () => setLanguage('ur'));
    if (placeResizeHandler) window.removeEventListener('resize', placeResizeHandler);
    placeResizeHandler = () => {
      if (englishPanel.hidden) {
        preparePreview(urduPanel, urdu, urduMore, ...urLabels);
      } else {
        preparePreview(englishPanel, english, englishMore, ...enLabels);
      }
    };
    window.addEventListener('resize', placeResizeHandler);
    initializeDescriptions = () => setLanguage(language);
  } else {
    descriptions.hidden = true;
    descriptionEmpty.hidden = false;
  }
  previous.disabled = places.length === 1;
  next.disabled = places.length === 1;
  previous.addEventListener('click', () => {
    navigateTo((index + places.length - 1) % places.length);
  });
  next.addEventListener('click', () => {
    navigateTo((index + 1) % places.length);
  });
  const placePreview = content.querySelector('.place-preview');
  if (!placePreview) throw new Error('Missing place preview container.');
  if (animate) placePreview.classList.add('place-changing');
  container.replaceChildren(content);
  initializeDescriptions();
  if (animate) name.focus({preventScroll: true});
}

function validCoordinates(latitude, longitude) {
  return Number.isFinite(latitude) && Math.abs(latitude) <= 85 &&
    Number.isFinite(longitude) && Math.abs(longitude) <= 180;
}

function straightLineKm(origin, destination) {
  const radians = degrees => degrees * Math.PI / 180;
  const lat1 = radians(origin.latitude);
  const lat2 = radians(destination.latitude);
  const dLat = lat2 - lat1;
  const dLon = radians(destination.longitude - origin.longitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function nearestTripPlaces(origin, places) {
  const remaining = [...places]
    .sort((a, b) => straightLineKm(origin, a) - straightLineKm(origin, b))
    .slice(0, 5);
  const ordered = [];
  let current = origin;
  while (remaining.length) {
    remaining.sort((a, b) => straightLineKm(current, a) - straightLineKm(current, b));
    current = remaining.shift();
    ordered.push(current);
  }
  return ordered;
}

function tripDirectionsUrl(origin, stops) {
  const coordinates = place => `${place.latitude},${place.longitude}`;
  const params = new URLSearchParams({
    api: '1',
    origin: coordinates(origin),
    destination: coordinates(stops[stops.length - 1])
  });
  if (stops.length > 1) params.set('waypoints', stops.slice(0, -1).map(coordinates).join('|'));
  return `https://www.google.com/maps/dir/?${params}`;
}

function renderNearby(container, template, places) {
  if (!Array.isArray(places)) throw new Error('Invalid place data.');
  const placesByCode = new Map();
  for (const place of places) {
    if (place.sourceCode === undefined) continue;
    if (typeof place.sourceCode !== 'string' || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(place.sourceCode) ||
        placesByCode.has(place.sourceCode)) {
      throw new Error('Invalid or duplicate location code.');
    }
    placesByCode.set(place.sourceCode, place);
  }
  const mappedPlaces = places.filter(place => {
    const hasLatitude = place.latitude !== undefined;
    const hasLongitude = place.longitude !== undefined;
    if (hasLatitude !== hasLongitude || (hasLatitude && !validCoordinates(place.latitude, place.longitude))) {
      throw new Error(`Invalid coordinates for ${place.slug}.`);
    }
    return hasLatitude;
  }).map(place => {
    if (!placesByCode.has(place.sourceCode)) throw new Error('Missing location code.');
    if (typeof place.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(place.slug)) {
      throw new Error('Invalid place slug.');
    }
    requireText(place.name, 'place name');
    validateMapUrl(place.mapUrl);
    return {sourceCode: place.sourceCode, latitude: place.latitude, longitude: place.longitude};
  });
  if (!mappedPlaces.length) throw new Error('No places with coordinates.');
  if (typeof L === 'undefined') throw new Error('Map library could not be loaded.');

  const content = document.importNode(template.content, true);
  translate(content);
  container.replaceChildren(content);
  const mapElement = field(container, 'map');
  const mapFrame = field(container, 'map-frame');
  const openMapButton = container.querySelector('[data-action="open-map"]');
  const closeMapButton = container.querySelector('[data-action="close-map"]');
  const status = field(container, 'origin-status');
  const mapOriginStatus = field(container, 'map-origin-status');
  const originAnnouncements = [field(container, 'origin-announcement'), field(container, 'map-origin-announcement')];
  const tileStatus = field(container, 'tile-status');
  const results = field(container, 'results');
  const tripStatuses = [field(container, 'trip-status'), field(container, 'map-trip-status')];
  const tripProgresses = [field(container, 'trip-progress'), field(container, 'map-trip-progress')];
  const tripSpinner = field(container, 'map-trip-spinner');
  const tripButton = container.querySelector('[data-action="map-trip"]');
  const tripDialog = field(container, 'trip-dialog');
  const tripOrigin = field(container, 'trip-origin');
  const tripStops = field(container, 'trip-stops');
  const tripDialogStatus = field(container, 'trip-dialog-status');
  const tripOpenProgress = field(container, 'trip-open-progress');
  const tripOpenSpinner = field(container, 'trip-open-spinner');
  const closeTrip = container.querySelector('[data-action="close-trip"]');
  const openTrip = container.querySelector('[data-action="open-trip"]');
  const setOriginStatus = message => { status.textContent = message; mapOriginStatus.textContent = message; };
  const setTripStatus = message => { for (const element of tripStatuses) element.textContent = message; };
  const map = L.map(mapElement).setView([mappedPlaces[0].latitude, mappedPlaces[0].longitude], 12);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  tiles.on('tileerror', () => {
    tileStatus.textContent = t('tileError');
  });
  let origin = null;
  let selectedOrigin = null;
  let originMarker = null;
  let locationRequest = 0;
  const placeMarkers = [];
  const pin = L.divIcon({className: 'nearby-pin', html: '', iconSize: [44, 44]});

  function layoutLabels() {
    const occupied = [];
    const originLabel = originMarker?.getTooltip()?.getElement();
    if (originLabel) occupied.push(originLabel.getBoundingClientRect());
    for (const marker of placeMarkers) {
      const label = marker.getTooltip()?.getElement();
      if (!label) continue;
      const rect = label.getBoundingClientRect();
      const overlap = occupied.some(other =>
        rect.left < other.right + 4 && rect.right + 4 > other.left &&
        rect.top < other.bottom + 4 && rect.bottom + 4 > other.top);
      label.style.visibility = overlap ? 'hidden' : 'visible';
      if (!overlap) occupied.push(rect);
    }
  }

  function scheduleLabels() {
    window.requestAnimationFrame(layoutLabels);
  }

  let lastView = {center: map.getCenter(), zoom: map.getZoom()};
  let viewRevision = 0;
  map.on('moveend zoomend', () => {
    lastView = {center: map.getCenter(), zoom: map.getZoom()};
    viewRevision++;
  });

  function resizeMap() {
    const view = lastView;
    const revision = viewRevision;
    window.requestAnimationFrame(() => {
      if (!mapFrame.open) return;
      const currentView = revision === viewRevision ? view : lastView;
      map.invalidateSize({pan: false});
      map.setView(currentView.center, currentView.zoom, {animate: false});
      scheduleLabels();
    });
  }

  openMapButton.addEventListener('click', () => {
    mapFrame.showModal();
    document.body.classList.toggle('nearby-map-open', true);
    document.documentElement.classList.toggle('nearby-map-open', true);
    resizeMap();
  });
  closeMapButton.addEventListener('click', () => mapFrame.close());
  mapFrame.addEventListener('close', () => {
    document.body.classList.toggle('nearby-map-open', false);
    document.documentElement.classList.toggle('nearby-map-open', false);
    openMapButton.focus();
  });

  function showResults() {
    if (!origin) {
      results.replaceChildren();
      return;
    }
    const ordered = mappedPlaces.map(place => ({
      place,
      distance: straightLineKm(origin, place)
    }));
    ordered.sort((a, b) => a.distance - b.distance);
    const list = document.createDocumentFragment();
    for (const {place, distance} of ordered.slice(0, 5)) {
      const details = placesByCode.get(place.sourceCode);
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `place.html?destination=madinah&place=${encodeURIComponent(details.slug)}`;
      link.textContent = t('distance', {name: localizedName(details), distance: distance.toFixed(1)});
      item.append(link);
      list.append(item);
    }
    results.replaceChildren(list);
  }

  function setOrigin(latitude, longitude, source) {
    if (!validCoordinates(latitude, longitude)) {
      setOriginStatus(t('invalidLocation'));
      return;
    }
    locationRequest++;
    origin = {latitude, longitude};
    selectedOrigin = source === 'Selected location' ? origin : null;
    if (originMarker) map.removeLayer(originMarker);
    originMarker = L.circleMarker([latitude, longitude], {
      radius: 9, color: '#ffffff', weight: 3, fillColor: '#245c3e', fillOpacity: 1
    }).addTo(map).bindTooltip(t('selectedLocationLabel'), {
      permanent: true, direction: 'top', offset: [0, -8], className: 'nearby-origin-label'
    });
    setOriginStatus('');
    for (const announcement of originAnnouncements) {
      announcement.textContent = t('locationAnnouncement', {
        source: t(source === 'Selected location' ? 'selectedLocation' : 'currentLocation'),
        latitude: latitude.toFixed(5), longitude: longitude.toFixed(5)
      });
    }
    map.setView([latitude, longitude], map.getZoom(), {animate: false});
    showResults();
    scheduleLabels();
  }

  for (const place of mappedPlaces) {
    const details = placesByCode.get(place.sourceCode);
    const label = document.createElement('span');
    label.textContent = localizedName(details);
    const marker = L.marker([place.latitude, place.longitude], {icon: pin, title: localizedName(details), alt: localizedName(details)})
      .addTo(map)
      .bindTooltip(label, {permanent: true, direction: 'top', offset: [0, -16], className: 'nearby-place-label'})
      .on('click', () => {
        window.open(details.mapUrl, '_blank', 'noopener,noreferrer');
      });
    marker.on('mouseover', () => {
      const tooltip = marker.getTooltip()?.getElement();
      if (tooltip) tooltip.style.visibility = 'visible';
    });
    marker.on('mouseout', scheduleLabels);
    placeMarkers.push(marker);
  }
  map.on('zoomend moveend', scheduleLabels);
  scheduleLabels();
  map.on('click', event => setOrigin(event.latlng.lat, event.latlng.lng, 'Selected location'));
  mapElement.addEventListener('keydown', event => {
    if (event.target === mapElement && event.key === 'Enter') {
      event.preventDefault();
      const centre = map.getCenter();
      setOrigin(centre.lat, centre.lng, 'Selected location');
    }
  });
  function requestCurrentLocation() {
    const request = ++locationRequest;
    if (!navigator.geolocation) {
      setOriginStatus(t('locationUnavailable'));
      return;
    }
    setOriginStatus(t('requestingLocation'));
    navigator.geolocation.getCurrentPosition(position => {
      if (request !== locationRequest) return;
      setOrigin(position.coords.latitude, position.coords.longitude, 'Current location');
    }, error => {
      if (request !== locationRequest) return;
      const reason = error.code === 1 ? t('permissionDenied') :
        error.code === 3 ? t('locationTimeout') : t('locationFailed');
      setOriginStatus(t('selectOnMap', {reason}));
    }, {timeout: 10000, maximumAge: 0});
  }
  container.querySelector('[data-action="locate"]').addEventListener('click', requestCurrentLocation);
  let tripRequest = 0;
  let handoffPending = false;
  let pendingTripUrl = null;
  function resetTrip() {
    tripRequest++;
    handoffPending = false;
    tripButton.disabled = false;
    tripButton.removeAttribute('aria-busy');
    tripSpinner.hidden = true;
    for (const progress of tripProgresses) progress.textContent = '';
    openTrip.disabled = false;
    openTrip.removeAttribute('aria-busy');
    tripOpenSpinner.hidden = true;
    tripOpenProgress.textContent = '';
  }
  function resetTripOnLeave() {
    resetTrip();
    if (tripDialog.open) tripDialog.close();
  }
  closeTrip.addEventListener('click', () => tripDialog.close());
  tripDialog.addEventListener('close', () => {
    pendingTripUrl = null;
    resetTrip();
    const target = mapFrame.open ? tripButton : openMapButton;
    target.focus();
  });
  window.addEventListener('pagehide', resetTripOnLeave);
  window.addEventListener('pageshow', resetTripOnLeave);
  document.addEventListener('visibilitychange', () => {
    if (handoffPending && document.visibilityState === 'hidden') resetTripOnLeave();
  });
  function showTrip(start, selected) {
    const stops = nearestTripPlaces(start, mappedPlaces);
    const list = document.createDocumentFragment();
    for (const stop of stops) {
      const item = document.createElement('li');
      item.textContent = localizedName(placesByCode.get(stop.sourceCode));
      list.append(item);
    }
    tripStops.replaceChildren(list);
    resetTrip();
    pendingTripUrl = tripDirectionsUrl(start, stops);
    tripOrigin.textContent = t(selected ? 'tripSelectedOrigin' : 'tripCurrentOrigin');
    tripDialogStatus.textContent = '';
    tripDialog.showModal();
  }
  function planTrip() {
    setTripStatus('');
    if (selectedOrigin) {
      showTrip(selectedOrigin, true);
      return;
    }
    if (!navigator.geolocation) {
      setTripStatus(t('tripLocationUnavailable'));
      return;
    }
    const request = ++tripRequest;
    tripButton.disabled = true;
    tripButton.setAttribute('aria-busy', 'true');
    tripSpinner.hidden = false;
    for (const progress of tripProgresses) progress.textContent = t('tripProgress');
    navigator.geolocation.getCurrentPosition(position => {
      if (request !== tripRequest) return;
      const current = {latitude: position.coords.latitude, longitude: position.coords.longitude};
      if (selectedOrigin) {
        showTrip(selectedOrigin, true);
        return;
      }
      if (!validCoordinates(current.latitude, current.longitude)) {
        resetTrip();
        setTripStatus(t('tripInvalidLocation'));
        return;
      }
      showTrip(current, false);
    }, error => {
      if (request !== tripRequest) return;
      if (selectedOrigin) {
        showTrip(selectedOrigin, true);
        return;
      }
      resetTrip();
      const reason = error.code === 1 ? t('permissionDenied') :
        error.code === 3 ? t('locationTimeout') : t('currentLocationFailed');
      setTripStatus(t('tripSelectOnMap', {reason}));
    }, {timeout: 10000, maximumAge: 0});
  }
  tripButton.addEventListener('click', planTrip);
  openTrip.addEventListener('click', () => {
    if (!pendingTripUrl) return;
    handoffPending = true;
    openTrip.disabled = true;
    openTrip.setAttribute('aria-busy', 'true');
    tripOpenSpinner.hidden = false;
    tripDialogStatus.textContent = '';
    tripOpenProgress.textContent = t('openingMaps');
    const request = tripRequest;
    try {
      window.location.assign(pendingTripUrl);
      window.setTimeout(() => {
        if (request === tripRequest) {
          resetTrip();
          tripDialogStatus.textContent = '';
        }
      }, 1500);
    } catch {
      resetTrip();
      tripDialogStatus.textContent = t('mapsError');
    }
  });
  showResults();
  requestCurrentLocation();
}

async function start() {
  const status = document.getElementById('load-status');
  const destinations = document.getElementById('destination-list');
  const places = document.getElementById('place-content');
  const nearby = document.getElementById('nearby-content');
  try {
    await setupLocale();
    status.textContent = t('loading');
    if (places) {
      places.dataset.destination = new URL(window.location.href).searchParams.get('destination') || '';
      placeDestination(places);
    }
    const [templateHtml, data, countries] = await Promise.all([
      loadResource('templates.html', 'text'),
      destinations ? loadDestinations() :
        loadResource(`data/${nearby ? 'madinah' : placeDestination(places)}.json`, 'json'),
      destinations ? loadResource('data/countries.json', 'json') : null
    ]);
    const templates = new DOMParser().parseFromString(templateHtml, 'text/html');
    if (destinations) {
      setupCountries(destinations, templates, data, countries);
    } else if (nearby) {
      if (data.id !== 'madinah') throw new Error('Invalid Madinah data.');
      renderNearby(nearby, getTemplate(templates, 'nearby-template'), data.places);
    } else if (places) {
      const template = getTemplate(templates, 'place-template');
      const destination = placeDestination(places);
      if (data.id !== destination) throw new Error('Invalid destination data.');
      const breadcrumb = document.getElementById('destination-breadcrumb');
      if (!breadcrumb) throw new Error('Missing destination breadcrumb.');
      requireText(data.name, 'destination name');
      breadcrumb.textContent = localizedName(data);
      breadcrumb.href = `place.html?destination=${encodeURIComponent(destination)}`;
      applyDestinationTheme(data.theme);
      const selectedSlug = new URL(window.location.href).searchParams.get('place') || undefined;
      renderPlaces(places, template, data.places, selectedSlug);
      window.history.replaceState(
        {destination, slug: places.dataset.placeSlug},
        '',
        window.location.href
      );
      window.addEventListener('popstate', () => {
        const currentPath = new URL(window.location.href).pathname;
        if (currentPath !== new URL('place.html', document.baseURI).pathname) return;
        const params = new URL(window.location.href).searchParams;
        if (params.get('destination') !== destination) return;
        const slug = params.get('place') || data.places[0].slug;
        if (places.dataset.placeSlug === slug) return;
        if (!data.places.some(place => place.slug === slug)) {
          status.textContent = t('notFound');
          return;
        }
        status.textContent = '';
        renderPlaces(places, template, data.places, slug, true);
      });
    } else {
      throw new Error('No content container found.');
    }
    status.textContent = '';
  } catch (error) {
    console.error('Unable to load site content:', error);
    status.textContent = locale.loadError || 'Unable to load content. Please check your connection and try again.';
  }
}

function setupInstall() {
  const button = document.getElementById('install-button');
  if (!button) return;
  const dialog = document.getElementById('install-dialog');
  const status = document.getElementById('install-status');
  const standalone = window.matchMedia?.('(display-mode: standalone)');
  let promptEvent = null;
  let installed = false;
  const refresh = () => {
    button.hidden = installed || Boolean(standalone?.matches) || navigator.standalone === true;
    if (button.hidden && dialog.open) dialog.close();
  };
  const showHelp = message => {
    if (button.hidden) return;
    status.textContent = message;
    dialog.showModal();
  };
  refresh();
  dialog.addEventListener('close', () => {
    if (!button.hidden) button.focus();
  });
  standalone?.addEventListener?.('change', refresh);
  window.addEventListener('beforeinstallprompt', event => {
    if (installed || standalone?.matches || navigator.standalone === true) return;
    event.preventDefault();
    promptEvent = event;
    refresh();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    promptEvent = null;
    refresh();
  });
  button.addEventListener('click', async () => {
    status.textContent = '';
    if (!promptEvent) {
      showHelp('');
      return;
    }
    const event = promptEvent;
    promptEvent = null;
    button.disabled = true;
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome !== 'accepted') showHelp(t('installCanceled'));
    } catch {
      showHelp(t('installError'));
    } finally {
      button.disabled = false;
    }
  });
}

setupInstall();
start();
