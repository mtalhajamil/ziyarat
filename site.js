'use strict';

let placeResizeHandler = null;

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
          !/^(?:(?:[a-z0-9-]+\/)+|[a-z0-9-]+\.html)$/.test(destination.page))) {
      throw new Error('Invalid destination page.');
    }
    if (destination.description !== undefined) {
      requireText(destination.description, 'destination description');
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
      if (destination.description) {
        status.textContent = destination.description;
      } else {
        status.hidden = true;
      }
    } else {
      status.textContent = 'Coming soon';
    }
    cards.append(card);
  }
  container.replaceChildren(cards);
}

function placeDestination(container) {
  const destination = container?.dataset.destination || 'madinah';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(destination)) {
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
    validateMapUrl(place.mapUrl);
  }

  const content = document.importNode(template.content, true);
  const name = field(content, 'name');
  const image = field(content, 'image');
  const imagePlaceholder = field(content, 'image-placeholder');
  const credit = field(content, 'image-credit');
  const imageSource = field(content, 'image-source');
  const imageLicense = field(content, 'image-license');
  const map = field(content, 'map');
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
    const url = new URL(`${destination}/`, document.baseURI);
    url.searchParams.set('place', nextPlace.slug);
    window.history.pushState({destination, slug: nextPlace.slug}, '', url.href);
    renderPlaces(container, template, places, nextPlace.slug, true);
  }

  const place = places[index];
  container.dataset.placeSlug = place.slug;
  document.title = `${place.name} | Ziyarat`;
  const currentBreadcrumb = document.querySelector('.breadcrumbs [aria-current="page"]');
  if (currentBreadcrumb) currentBreadcrumb.textContent = place.name;
  name.textContent = place.name;
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
  map.href = place.mapUrl;
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
    english.textContent = place.english ?? 'English translation coming soon.';
    urdu.textContent = place.urdu ?? 'اردو تفصیل جلد شامل کی جائے گی۔';
    const englishPanel = field(content, 'english-panel');
    const urduPanel = field(content, 'urdu-panel');
    const englishButton = field(content, 'language-en');
    const urduButton = field(content, 'language-ur');
    function preparePreview(panel, paragraph, button, moreLabel, lessLabel) {
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
      button.textContent = keepExpanded ? 'Show less' : 'Show more';
      button.setAttribute('aria-expanded', String(keepExpanded));
      button.setAttribute('aria-label', keepExpanded ? lessLabel : moreLabel);
    }
    function bindPreview(paragraph, button, moreLabel, lessLabel) {
      button.addEventListener('click', () => {
        const expanded = button.getAttribute('aria-expanded') === 'true';
        paragraph.dataset.collapsed = String(expanded);
        button.setAttribute('aria-expanded', String(!expanded));
        button.textContent = expanded ? 'Show more' : 'Show less';
        button.setAttribute('aria-label', expanded ? moreLabel : lessLabel);
      });
    }
    bindPreview(english, englishMore, 'Show more description', 'Show less description');
    bindPreview(urdu, urduMore, 'مزید تفصیل دکھائیں', 'کم تفصیل دکھائیں');
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
        isEnglish ? 'Show more description' : 'مزید تفصیل دکھائیں',
        isEnglish ? 'Show less description' : 'کم تفصیل دکھائیں'
      );
    }
    englishButton.addEventListener('click', () => setLanguage('en'));
    urduButton.addEventListener('click', () => setLanguage('ur'));
    if (placeResizeHandler) window.removeEventListener('resize', placeResizeHandler);
    placeResizeHandler = () => {
      if (englishPanel.hidden) {
        preparePreview(urduPanel, urdu, urduMore, 'مزید تفصیل دکھائیں', 'کم تفصیل دکھائیں');
      } else {
        preparePreview(englishPanel, english, englishMore, 'Show more description', 'Show less description');
      }
    };
    window.addEventListener('resize', placeResizeHandler);
    initializeDescriptions = () => setLanguage('en');
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

function renderNearby(container, template, places) {
  if (!Array.isArray(places)) throw new Error('Invalid place data.');
  const mappedPlaces = places.filter(place => {
    const hasLatitude = place.latitude !== undefined;
    const hasLongitude = place.longitude !== undefined;
    if (hasLatitude !== hasLongitude || (hasLatitude && !validCoordinates(place.latitude, place.longitude))) {
      throw new Error(`Invalid coordinates for ${place.slug}.`);
    }
    return hasLatitude;
  });
  if (!mappedPlaces.length) throw new Error('No places with coordinates.');
  for (const place of mappedPlaces) {
    requireText(place.name, 'place name');
    validateMapUrl(place.nearbyMapUrl ?? place.mapUrl);
  }
  if (typeof L === 'undefined') throw new Error('Map library could not be loaded.');

  const content = document.importNode(template.content, true);
  container.replaceChildren(content);
  const mapElement = field(container, 'map');
  const mapFrame = field(container, 'map-frame');
  const fullscreenButton = container.querySelector('[data-action="fullscreen"]');
  const status = field(container, 'origin-status');
  const tileStatus = field(container, 'tile-status');
  const results = field(container, 'results');
  const map = L.map(mapElement).setView([mappedPlaces[0].latitude, mappedPlaces[0].longitude], 12);
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  tiles.on('tileerror', () => {
    tileStatus.textContent = 'Some map tiles could not be loaded. Check your connection; the place list is still available.';
  });
  let origin = null;
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

  let fullscreenMode = null;
  let viewBeforeResize = null;
  let lastView = {center: map.getCenter(), zoom: map.getZoom()};
  map.on('moveend zoomend', () => {
    lastView = {center: map.getCenter(), zoom: map.getZoom()};
  });

  function resizeMap() {
    const view = viewBeforeResize || lastView;
    viewBeforeResize = null;
    window.requestAnimationFrame(() => {
      map.invalidateSize({pan: false});
      map.setView(view.center, view.zoom, {animate: false});
      scheduleLabels();
    });
  }

  function setFullscreen(active, mode) {
    fullscreenMode = active ? mode : null;
    mapFrame.classList.toggle('is-fullscreen', active && mode === 'fallback');
    document.body.classList.toggle('nearby-fullscreen-open', active);
    fullscreenButton.textContent = active ? 'Exit full screen' : 'Full screen';
    fullscreenButton.setAttribute('aria-pressed', String(active));
    if (active) {
      mapFrame.setAttribute('role', 'dialog');
      mapFrame.setAttribute('aria-modal', 'true');
      mapFrame.setAttribute('aria-label', 'Full screen map');
    } else {
      mapFrame.removeAttribute('role');
      mapFrame.removeAttribute('aria-modal');
      mapFrame.removeAttribute('aria-label');
    }
    fullscreenButton.focus();
    resizeMap();
  }

  fullscreenButton.addEventListener('click', async () => {
    viewBeforeResize = {center: map.getCenter(), zoom: map.getZoom()};
    if (fullscreenMode === 'native') {
      try {
        await document.exitFullscreen();
      } catch {
        status.textContent = 'Could not exit full screen. Try pressing Escape.';
      }
    } else if (fullscreenMode === 'fallback') {
      setFullscreen(false);
    } else if (mapFrame.requestFullscreen) {
      try {
        await mapFrame.requestFullscreen();
      } catch {
        setFullscreen(true, 'fallback');
      }
    } else {
      setFullscreen(true, 'fallback');
    }
  });
  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === mapFrame) setFullscreen(true, 'native');
    else if (fullscreenMode === 'native') setFullscreen(false);
  });
  document.addEventListener('keydown', event => {
    if (!fullscreenMode) return;
    if (event.key === 'Escape' && fullscreenMode === 'fallback') {
      event.preventDefault();
      viewBeforeResize = {center: map.getCenter(), zoom: map.getZoom()};
      setFullscreen(false);
    } else if (event.key === 'Tab') {
      const focusable = [...mapFrame.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter(element => element.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
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
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = place.nearbyMapUrl ?? place.mapUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `${place.name} — ${distance.toFixed(1)} km straight-line (open in Google Maps)`;
      item.append(link);
      list.append(item);
    }
    results.replaceChildren(list);
  }

  function setOrigin(latitude, longitude, source) {
    if (!validCoordinates(latitude, longitude)) {
      status.textContent = 'That location is outside the supported map area. Please select another location.';
      return;
    }
    locationRequest++;
    origin = {latitude, longitude};
    if (originMarker) map.removeLayer(originMarker);
    originMarker = L.circleMarker([latitude, longitude], {
      radius: 9, color: '#ffffff', weight: 3, fillColor: '#245c3e', fillOpacity: 1
    }).addTo(map).bindTooltip('Your selected location', {
      permanent: true, direction: 'top', offset: [0, -8], className: 'nearby-origin-label'
    });
    status.textContent = `${source}: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}. Select a place to open it in Google Maps.`;
    map.setView([latitude, longitude], map.getZoom());
    showResults();
    scheduleLabels();
  }

  for (const place of mappedPlaces) {
    const label = document.createElement('span');
    label.textContent = place.name;
    const marker = L.marker([place.latitude, place.longitude], {icon: pin, title: place.name, alt: place.name})
      .addTo(map)
      .bindTooltip(label, {permanent: true, direction: 'top', offset: [0, -16], className: 'nearby-place-label'})
      .on('click', () => {
        window.open(place.nearbyMapUrl ?? place.mapUrl, '_blank', 'noopener,noreferrer');
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
  container.querySelector('[data-action="locate"]').addEventListener('click', () => {
    const request = ++locationRequest;
    if (!navigator.geolocation) {
      status.textContent = 'Location is unavailable. Select a point on the map instead.';
      return;
    }
    status.textContent = 'Requesting your location…';
    navigator.geolocation.getCurrentPosition(position => {
      if (request !== locationRequest) return;
      setOrigin(position.coords.latitude, position.coords.longitude, 'Current location');
    }, error => {
      if (request !== locationRequest) return;
      const reason = error.code === 1 ? 'Location permission was denied.' :
        error.code === 3 ? 'The location request timed out.' : 'Your location could not be determined.';
      status.textContent = `${reason} Select a point on the map instead.`;
    }, {timeout: 10000, maximumAge: 0});
  });
  showResults();
}

async function start() {
  const status = document.getElementById('load-status');
  const destinations = document.getElementById('destination-list');
  const places = document.getElementById('place-content');
  const nearby = document.getElementById('nearby-content');
  status.textContent = 'Loading…';
  try {
    const [templateHtml, data] = await Promise.all([
      loadResource('templates.html', 'text'),
      destinations ? loadDestinations() :
        loadResource(`data/${nearby ? 'madinah' : placeDestination(places)}.json`, 'json')
    ]);
    const templates = new DOMParser().parseFromString(templateHtml, 'text/html');
    if (destinations) {
      renderDestinations(destinations, getTemplate(templates, 'destination-template'), data);
    } else if (nearby) {
      if (data.id !== 'madinah') throw new Error('Invalid Madinah data.');
      renderNearby(nearby, getTemplate(templates, 'nearby-template'), data.places);
    } else if (places) {
      const template = getTemplate(templates, 'place-template');
      const destination = placeDestination(places);
      if (data.id !== destination) throw new Error('Invalid destination data.');
      applyDestinationTheme(data.theme);
      const selectedSlug = new URL(window.location.href).searchParams.get('place') || undefined;
      renderPlaces(places, template, data.places, selectedSlug);
      window.history.replaceState(
        {destination, slug: places.dataset.placeSlug},
        '',
        window.location.href
      );
      window.addEventListener('popstate', () => {
        const basePath = new URL(document.baseURI).pathname;
        const currentPath = new URL(window.location.href).pathname;
        if (!currentPath.startsWith(basePath)) return;
        const relative = currentPath.slice(basePath.length);
        if (relative !== `${destination}/` && !(destination === 'madinah' && relative === 'madinah.html')) return;
        const slug = new URL(window.location.href).searchParams.get('place') || data.places[0].slug;
        if (places.dataset.placeSlug === slug) return;
        if (!data.places.some(place => place.slug === slug)) {
          status.textContent = 'This place could not be found.';
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
    status.textContent = 'Unable to load content. Please check your connection and try again.';
  }
}

start();
