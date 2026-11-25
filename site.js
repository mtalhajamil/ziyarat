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
  if (!['madinah', 'makkah', 'badr'].includes(destination)) {
    throw new Error('Unsupported place destination.');
  }
  return destination;
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
    const url = new URL(`${destination}/${nextPlace.slug}/`, document.baseURI);
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

async function start() {
  const status = document.getElementById('load-status');
  const destinations = document.getElementById('destination-list');
  const places = document.getElementById('place-content');
  status.textContent = 'Loading…';
  try {
    const [templateHtml, data] = await Promise.all([
      loadResource('templates.html', 'text'),
      loadResource(destinations ? 'data/destinations.json' : `data/${placeDestination(places)}.json`, 'json')
    ]);
    const templates = new DOMParser().parseFromString(templateHtml, 'text/html');
    if (destinations) {
      renderDestinations(destinations, getTemplate(templates, 'destination-template'), data);
    } else if (places) {
      const template = getTemplate(templates, 'place-template');
      const destination = placeDestination(places);
      renderPlaces(places, template, data);
      window.history.replaceState(
        {destination, slug: places.dataset.placeSlug},
        '',
        window.location.href
      );
      window.addEventListener('popstate', () => {
        const basePath = new URL(document.baseURI).pathname;
        const currentPath = new URL(window.location.href).pathname;
        if (!currentPath.startsWith(basePath)) return;
        const [currentDestination, slug] = currentPath.slice(basePath.length).split('/').filter(Boolean);
        if (currentDestination !== destination ||
            !data.some(place => place.slug === slug) ||
            places.dataset.placeSlug === slug) return;
        renderPlaces(places, template, data, slug, true);
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
