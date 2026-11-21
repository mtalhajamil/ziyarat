# Design guardrails

- Design mobile-first. Every page and component must adapt to narrow phones, tablets, and desktop screens without horizontal overflow or clipped content.
- Keep text readable and images proportionate. Preserve language and right-to-left direction for Urdu content.
- Make interactive controls keyboard accessible and provide visible focus states. Use touch targets of at least 44 by 44 CSS pixels.
- Verify changes at mobile widths (including 320 and 375 pixels) and desktop width, checking layout, images, text, navigation, and controls. Report explicitly if rendered viewport checks cannot be performed.
- Keep the site static and build-free: use the existing templates, JSON data, and local assets. Update the asset version in both HTML pages when changing CSS or JavaScript, as described in the README.

# Content and code separation

- Keep destination and place content in repository JSON files under `data/`; load it rather than duplicating it in markup or application logic.
- Keep presentation markup and styling in `templates.html` and `styles.css`, separate from data and the rendering logic in `site.js`.
- Store site images locally under `assets/images/`, with correct source and license information recorded in the README.
- Keep changes simple and maintain compatibility with GitHub Pages and its project-relative paths; do not add a build step without an explicit request.
