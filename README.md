# Ziyarat

A minimal static website foundation for exploring places of ziyarat.

Run `python3 -m http.server 8000` from this directory and open `http://localhost:8000/`. JavaScript and an HTTP server are required to load the JSON and templates; opening the HTML files directly will not work. No build step or dependencies are required.

Destination cards are stored in `data/destinations.json`; Madinah places are in `data/madinah.json`. Add an entry using the existing fields, put its image in `assets/images/`, and use its local path, alt text, and dimensions in the JSON. A destination without a `page` is marked coming soon. Each Madinah place needs a name, image, English and Urdu descriptions, and an HTTPS Google Maps URL. The navigation arrows are disabled for a single place and navigate between entries when more are added. Update the image sources below when adding photographs, and follow their license terms.

The reusable markup lives in `templates.html`; `site.js` loads the templates and data. Paths are relative so the site also works under a GitHub Pages project URL.

Run `node --test tests/site.test.cjs` to check content rendering and navigation.

When changing `styles.css` or `site.js`, update the corresponding `?v=` value in both HTML pages so visitors receive the new version without waiting for cached assets to expire.

## Image sources

- Makkah: [Medineli / Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Kaaba_at_night.jpg), CC0.
- Madinah: [Wurzelgnohm / Wikimedia Commons](https://commons.wikimedia.org/wiki/File:MasjidNabawi.jpg), CC0.
- Badr: [Konevi / Pixabay](https://pixabay.com/photos/monument-badr-martyrs-islam-5097514/), Pixabay Content License.
- Quba Mosque: [Konevi / Pixabay](https://pixabay.com/photos/cuba-quba-cami-masjid-religion-3723174/), Pixabay Content License.
- Taif: [Musaddek Sayek / Pexels](https://www.pexels.com/photo/scenic-view-of-taif-city-architecture-in-makkah-38048226/), Pexels License.
- Turkiye: [Mustang Joe / Wikimedia Commons](https://commons.wikimedia.org/wiki/File:The_Hagia_Sophia_Grand_Mosque,_Istanbul,_T%C3%BCrkiye_(53807697806).jpg), CC0.
