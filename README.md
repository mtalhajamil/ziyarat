# Ziyarat

A minimal static website foundation for exploring places of ziyarat.

Run `python3 -m http.server 8000` from this directory and open `http://localhost:8000/`. JavaScript and an HTTP server are required to load the JSON and templates; opening the HTML files directly will not work. No build step or dependencies are required.

Destination cards are stored in `data/destinations.json`; Madinah places are in `data/madinah.json`. Add an entry using the existing fields, put its image in `assets/images/`, and use its local path, alt text, and dimensions in the JSON. A destination without a `page` is marked coming soon. Each Madinah place needs a unique lowercase, hyphen-separated `slug`, name, image, English and Urdu descriptions, and an HTTPS Google Maps URL. For images requiring attribution, provide `image.credit` with `description`, `sourceUrl`, `license`, and `licenseUrl` as in the Jummah entry; identify the creator and any changes. Create `madinah/<slug>/index.html` from the Quba page and update its title, breadcrumb, and `data-place-slug` to match the new entry. This static page makes the clean URL work on direct visits and refreshes. The navigation arrows are disabled for a single place and navigate between these URLs when more are added. Update the image sources below when adding photographs, and follow their license terms.

The reusable markup lives in `templates.html`; `site.js` loads the templates and data. Directory index pages use a relative base URL so resources resolve under a GitHub Pages project URL. `/madinah/` shows the first place, `/madinah/quba/` opens Quba directly, and the old `madinah.html` link remains available.

Run `node --test tests/site.test.cjs` to check content rendering and navigation.

When changing `styles.css`, `site.js`, or the favicon, update the corresponding `?v=` value in every HTML page so visitors receive the new version without waiting for cached assets to expire.

Urdu text uses a locally hosted Arabic subset of [Noto Naskh Arabic](https://fonts.google.com/noto/specimen/Noto+Naskh+Arabic) with system font fallbacks. Its SIL Open Font License is included at `assets/fonts/OFL.txt`.

## Image sources

- Makkah: [Medineli / Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Kaaba_at_night.jpg), CC0.
- Madinah: [Wurzelgnohm / Wikimedia Commons](https://commons.wikimedia.org/wiki/File:MasjidNabawi.jpg), CC0.
- Badr: [Konevi / Pixabay](https://pixabay.com/photos/monument-badr-martyrs-islam-5097514/), Pixabay Content License.
- Quba Mosque: [Konevi / Pixabay](https://pixabay.com/photos/cuba-quba-cami-masjid-religion-3723174/), Pixabay Content License.
- Taif: [Musaddek Sayek / Pexels](https://www.pexels.com/photo/scenic-view-of-taif-city-architecture-in-makkah-38048226/), Pexels License.
- Turkiye: [Mustang Joe / Wikimedia Commons](https://commons.wikimedia.org/wiki/File:The_Hagia_Sophia_Grand_Mosque,_Istanbul,_T%C3%BCrkiye_(53807697806).jpg), CC0.
- Masjid Qiblatain (`assets/images/qiblatain.jpg`, 960 × 1280): [Saad Alkot / Pexels](https://www.pexels.com/photo/masjid-al-qiblatain-in-medina-19858725/), [Pexels License](https://www.pexels.com/license/) (attribution not required).
- Masjid Jummah (`assets/images/jummah.jpg`, 1280 × 843): [“Masjid Jum'ah.jpg”](https://commons.wikimedia.org/wiki/File:Masjid_Jum%27ah.jpg) by Imam Khairul Annas, via Wikimedia Commons, under [CC BY-SA 3.0 Unported](https://creativecommons.org/licenses/by-sa/3.0/). Cropped, resized and recompressed; the local JPEG is distributed under the same license.
- Masjid Ghamama (`assets/images/ghamama.jpg`, 1280 × 960): [“Mosque of Al-Ghamama 2026-05-13.jpg”](https://commons.wikimedia.org/wiki/File:Mosque_of_Al-Ghamama_2026-05-13.jpg) by FaysaLBinDaruL, via Wikimedia Commons, under [CC BY 4.0 International](https://creativecommons.org/licenses/by/4.0/). Resized and recompressed.
