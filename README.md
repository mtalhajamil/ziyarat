# Ziyarat

A static, build-free website for exploring places of ziyarat. Read [AGENTS.md](AGENTS.md) for the repository's mobile-first, accessibility and content-separation guardrails. Do not invent historical descriptions, translations, locations, photo identities or licenses; use supplied or verified information and leave missing content marked as such.

## Run locally

From the repository root:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/`, or visit `http://localhost:8000/madinah/quba/` directly. The browser needs JavaScript and an HTTP server to fetch the templates and JSON; opening files using `file://` does not work. There is no build step, framework, package installation or server-side application. Node.js is needed only for the tests below.

## How it works

| Path | Responsibility |
| --- | --- |
| `index.html`, `madinah.html`, `{madinah,makkah,badr}/**/index.html` | Static page shells, navigation, asset versions and content containers. Each place route has its own directory index. |
| `data/destinations.json` | Homepage cards, images, optional descriptions and links. |
| `data/madinah.json`, `data/makkah.json`, `data/badr.json` | Ordered destination places, map links, optional images, credits and available English/Urdu descriptions. |
| `templates.html` | Reusable destination and place markup, including missing-content states. |
| `site.js` | Fetches and validates the data and templates, renders the page, and handles place navigation. |
| `styles.css` | Shared responsive styles, the Madinah theme and locally hosted Urdu font. |
| `assets/images/`, `assets/fonts/`, `assets/favicon.svg` | Local site assets. The Noto Naskh Arabic font license is `assets/fonts/OFL.txt`. |
| `tests/site.test.cjs` | Node tests for rendering, validation, routes and asset versions. |

The page shell loads `site.js`, which fetches `templates.html` and the relevant JSON with `cache: 'no-cache'`, clones a template and inserts text as text rather than HTML. Invalid data or failed requests produce an error message instead of partial content; inspect the browser console for details. All place entries for a destination are validated before a place is shown, so one invalid entry can prevent that destination's places from loading.

Place descriptions show English by default. The compact, right-aligned EN/UR box toggle switches between available descriptions, with Urdu rendered right-to-left; the selection resets to English when a place opens. If a translation is missing, its panel displays a translation-coming-soon message rather than invented history. Descriptions longer than three rendered lines start clamped and get an accessible Show more/Show less button; shorter text has no redundant button. Places with neither description show “Description coming soon” without language controls. Supplied YouTube links appear as external “Watch place video” links.

The homepage links Madinah to `/madinah/quba/`, Makkah to `/makkah/hudaybiyyah/` and Badr to `/badr/anas-bin-malik/`; Taif and Turkiye still show “Coming soon”. Each destination's directory index displays its first JSON entry. The legacy `madinah.html` does the same for Madinah. Each `/<destination>/<slug>/` page selects its entry through `data-place-slug`. The arrows update the place in-page, maintain shareable clean URLs, support browser back/forward, and wrap around within that destination's JSON order; a subtle transition respects reduced-motion preferences. Both arrows are disabled when there is only one entry. Adding JSON alone does **not** create a route.

The shared renderer supports `madinah`, `makkah` and `badr`. The page container's `data-destination` selects its JSON and navigation prefix; older Madinah shells omit it and default to Madinah. Unknown destinations are rejected. A further destination requires updating the supported list in `site.js`, adding JSON and route shells, and testing them; adding a homepage link alone is not enough. Makkah and Badr currently use missing-image and missing-description placeholders, not inferred historical details.

Directory pages use a relative `<base>` so links, scripts, styles, data and images resolve under the GitHub Pages project path as well as at a local root. Keep the existing relative paths and test direct entry and refresh on nested pages; do not assume a server-side router or rewrite rules.

The homepage's Open Graph and Twitter Card metadata is in the initial `index.html`, so sharing services can read it without JavaScript. The canonical URL and share-image URLs are absolute and tied to the GitHub Pages address; update them if the site moves. `assets/images/share.jpg` is a 1200 × 630 JPEG. Social platforms may cache old previews after a deployment.

## Destination theme guide

The homepage has its own existing warm-neutral theme (`#f7f6f0` background, `#242d26` text). All implemented place pages currently reuse the Madinah light-green theme (`#f2f8ef` background), deep green (`#1c4935` text and `#245c3e` map button), muted gold accents, softly translucent cards and rounded images. Makkah and Badr do not yet have distinct themes. See `styles.css` for the actual gradients, colors and responsive layout.

The following are **proposed starting palettes**, not implemented themes; confirm the direction with the owner before introducing a distinct destination design. Taif and Turkiye are still coming soon:

| Destination | Background | Main text | Dark control | Direction |
| --- | --- | --- | --- | --- |
| Makkah | `#faf7ef` | `#302b26` | `#51432f` | Warm ivory, charcoal and restrained gold. |
| Badr | `#f8f3e8` | `#403b2e` | `#56523a` | Sand and muted olive. |
| Taif | `#faf3f1` | `#443436` | `#6c4046` | Soft rose and warm neutrals. |
| Turkiye | `#f2f6f7` | `#293e45` | `#305764` | Pale blue-gray and muted teal. |

Keep the existing light, calm visual language: centered place heading, proportionate local image, full-width map link, readable bilingual descriptions and compact breadcrumb. Use dark text on light surfaces and white text on dark controls; check the actual rendered colors, including translucent layers, for at least 4.5:1 normal-text contrast and visible focus. Preserve the existing system/Georgia typography and local Noto Naskh Arabic for Urdu unless a different design is requested. Apply the mobile, touch-target and accessibility requirements in `AGENTS.md`; never assume a proposed palette or a place-specific design already exists.

## Add or update content

1. Edit the appropriate JSON file, not the reusable markup or rendering logic. Destination entries require a name and image; `page` and `description` are optional. A live `page` must be a relative directory URL ending in `/` or a simple `.html` filename, as validated by `site.js`.
2. A destination place requires a unique lowercase, hyphen-separated `slug`, `name` and an HTTPS Google Maps `mapUrl`. The accepted hosts and paths are checked in `site.js`. Retain a supplied spreadsheet identifier as optional `sourceCode`; it does not replace the stable route slug. Omit `image` if no reliably identified, licensed image is available. `english` and `urdu` are independently optional; if one translation is absent, its language panel says it is coming soon. Omit both when no description is supplied; the page then shows “Description coming soon”. Optional `videoUrl` must be a secure YouTube watch, shorts, embed or short-link URL.
3. Preserve supplied Urdu text and punctuation; only format it when requested. Put paragraph breaks in JSON as `\n\n`; the stylesheet preserves them and the template sets Urdu to `lang="ur"` and `dir="rtl"`. Translate supplied text faithfully rather than inventing additional content. Long descriptions are initially clamped to three rendered lines.
4. For a new place entry, copy a shell from the same destination to `<destination>/<slug>/index.html` and update its title, breadcrumb and `data-place-slug`. Makkah and Badr shells must retain the matching `data-destination`. Keep `<base href="../../">` and the current asset versions. The slider links to that directory, so every entry needs its matching file.
5. If adding a photograph, put it in `assets/images/` and set `image.src`, `alt`, `width` and `height` to its actual local path and dimensions. Image filenames may contain letters, digits, `_` and `-`; supported extensions are `jpg`, `jpeg`, `png` and `webp`. Verify the subject and reuse license; never substitute a photo of a different place.
6. Record the source, creator, license and modifications below. Where a place photo requires visible attribution, add `image.credit` with `description`, `sourceUrl`, `license` and `licenseUrl`, following the Jummah entry. Credit URLs must be HTTPS; the place template renders the source and license links. Destination cards do not currently render image credits, so do not use an image requiring visible attribution there without implementing that support.

## Validate and deploy

```sh
node --test tests/site.test.cjs
git diff --check
```

The tests exercise the JSON renderer with a simulated DOM, validation, navigation and route files; they are not rendered browser or visual tests. When intentionally adding places, update the expected place names and map searches in `tests/site.test.cjs`. For UI changes, also check 320px and 375px mobile widths and desktop, including Urdu, image alignment, links and keyboard focus, when browser access is permitted. Report explicitly if visual checks cannot be performed.

When changing `styles.css`, `site.js` or `assets/favicon.svg`, update that asset's `?v=` value in **every** HTML page, including all place directory indexes. JSON and templates are fetched with revalidation; HTML and static assets may still be cached.

GitHub Pages is configured to publish the repository's `main` branch from `/` at [mtalhajamil.github.io/ziyarat/](https://mtalhajamil.github.io/ziyarat/). Follow the owner's instructions and repository protections when publishing; do not merge on the owner's behalf. With an authorized `gh` session, check the latest build with:

```sh
gh api repos/mtalhajamil/ziyarat/pages/builds/latest --jq '{status,commit}'
```

After the intended commit is built, check the live homepage, changed nested routes, data and assets. Allow for GitHub Pages cache propagation; a successful Git push alone does not establish that the updated site is live.

Urdu text uses a locally hosted Arabic subset of [Noto Naskh Arabic](https://fonts.google.com/noto/specimen/Noto+Naskh+Arabic) with system font fallbacks, not a font CDN.

## Image sources

- Makkah: [Medineli / Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Kaaba_at_night.jpg), CC0.
- Madinah: [Wurzelgnohm / Wikimedia Commons](https://commons.wikimedia.org/wiki/File:MasjidNabawi.jpg), CC0.
- Homepage share image (`assets/images/share.jpg`): cropped and resized from the Madinah image above, CC0.
- Badr: [Konevi / Pixabay](https://pixabay.com/photos/monument-badr-martyrs-islam-5097514/), Pixabay Content License.
- Quba Mosque: [Konevi / Pixabay](https://pixabay.com/photos/cuba-quba-cami-masjid-religion-3723174/), Pixabay Content License.
- Taif: [Musaddek Sayek / Pexels](https://www.pexels.com/photo/scenic-view-of-taif-city-architecture-in-makkah-38048226/), Pexels License.
- Turkiye: [Mustang Joe / Wikimedia Commons](https://commons.wikimedia.org/wiki/File:The_Hagia_Sophia_Grand_Mosque,_Istanbul,_T%C3%BCrkiye_(53807697806).jpg), CC0.
- Masjid Qiblatain (`assets/images/qiblatain.jpg`, 960 × 1280): [Saad Alkot / Pexels](https://www.pexels.com/photo/masjid-al-qiblatain-in-medina-19858725/), [Pexels License](https://www.pexels.com/license/) (attribution not required).
- Masjid Jummah (`assets/images/jummah.jpg`, 1280 × 843): [“Masjid Jum'ah.jpg”](https://commons.wikimedia.org/wiki/File:Masjid_Jum%27ah.jpg) by Imam Khairul Annas, via Wikimedia Commons, under [CC BY-SA 3.0 Unported](https://creativecommons.org/licenses/by-sa/3.0/). Cropped, resized and recompressed; the local JPEG is distributed under the same license.
- Masjid Ghamama (`assets/images/ghamama.jpg`, 1280 × 960): [“Mosque of Al-Ghamama 2026-05-13.jpg”](https://commons.wikimedia.org/wiki/File:Mosque_of_Al-Ghamama_2026-05-13.jpg) by FaysaLBinDaruL, via Wikimedia Commons, under [CC BY 4.0 International](https://creativecommons.org/licenses/by/4.0/). Resized and recompressed.
- Masjid al-Saqia: [“مسجد السقيا”](https://commons.wikimedia.org/wiki/File:%D9%85%D8%B3%D8%AC%D8%AF_%D8%A7%D9%84%D8%B3%D9%82%D9%8A%D8%A7.jpg) by Imam Khairul Annas, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Resized.
- Masjid-e-Shaykhain: [“Madina trip 145”](https://commons.wikimedia.org/wiki/File:Madina_trip_145.jpg) by Ashashyou, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Resized.
- Jabal-e-Uhud: [“Mount Uhud, Medina, 20241002 091235 780”](https://commons.wikimedia.org/wiki/File:Mount_Uhud,_Medina,_20241002_091235_780.jpg) by Ahmed, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Resized.
- Jabal-e-Ruma: [“Archers' Hill, Uhud”](https://commons.wikimedia.org/wiki/File:Archers%27_Hill,_Uhud.jpg) by Ahill34, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Resized.
- Masjid-e-Sab'ah: [“Mosque of Salman al-Farisi at the Seven Mosques”](https://commons.wikimedia.org/wiki/File:Mosque_of_Salman_al-Farisi_at_the_Seven_Mosques,_Madinah,_Saudi_Arabia_(2).jpg) by Richard Mortel, [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/). Resized.
- Masjid-e-Fath: [“Madina trip 106”](https://commons.wikimedia.org/wiki/File:Madina_trip_106.jpg) by Ashashyou, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Resized.
- Masjid Al-Mustarāh: [“Madina trip 137”](https://commons.wikimedia.org/wiki/File:Madina_trip_137.jpg) by Ashashyou, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Resized.
- Masjid Banu Unaif: [“مسجد بني أُنَيْف”](https://commons.wikimedia.org/wiki/File:%D9%85%D8%B3%D8%AC%D8%AF_%D8%A8%D9%86%D9%8A_%D8%A3%D9%8F%D9%86%D9%8E%D9%8A%D9%92%D9%81.jpg) by Ayman dhū alghiná, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Resized.
