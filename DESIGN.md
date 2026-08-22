# Portable Runner API Docs Design

## 0. Research Log

- Existing repository README and `src/index.d.ts`: source of truth for API names, signatures, plan fields, report fields, and version `0.1.6`.
- Existing package boundary: static HTML/CSS/JavaScript only, with no runtime dependency or external CDN requirement.

## 1. Product intent

The GitHub Pages site is a fast, trustworthy API reference for engineers using
`@dsh-plugin-evaluation/portable-runner`. It should answer three questions
quickly: how do I install it, how do I run one plan, and what does the report
mean?

## 2. Layout grammar

- Desktop: fixed-width reading canvas with a compact left navigation rail, a
  spacious article column, and a small right-side release card.
- Mobile: one-column document flow; navigation becomes a horizontal scrollable
  row and the release card moves below the article.
- Sections are anchor-addressable so links can land on API entries directly.

## 3. Visual tokens

- Background: ink `#0b1018`, elevated panels `#111a26`, border `#243247`.
- Text: warm white `#eef4fb`, muted blue-gray `#91a4bb`.
- Accent: cyan `#62d8ff`; success mint `#8ce5b0`; warning amber `#f5bd6f`.
- Type: system sans for UI and headings; system monospace for code and API
  names.
- Spacing: 8px base unit; 12px card radius; 1px borders; restrained shadows.

## 4. Components and states

- Header: package identity, version badge, npm link, GitHub link.
- Search: filters navigation and API cards by visible text; keyboard shortcut
  `/` focuses it.
- Navigation: active section state follows scroll position and click targets
  remain keyboard accessible.
- Code blocks: copy button with explicit `Copied` feedback; no hover-only
  information.
- API cards: stable anchor IDs, signature, purpose, parameters, and return
  value.

## 5. Accessibility and responsive constraints

- Use semantic `header`, `nav`, `main`, `aside`, `section`, and headings.
- All controls have visible labels or accessible names.
- Focus indicators use the cyan accent and remain visible on dark surfaces.
- Respect `prefers-reduced-motion`; transitions are limited to opacity and
  transform.
- Code remains horizontally scrollable rather than wrapping into unreadable
  fragments.

## 6. Accepted debt

- API content is maintained in static HTML rather than generated from TypeScript
  declarations. A future release can generate this page, but the current site
  intentionally keeps zero build-time dependencies.
- The page documents the public API manually and links back to the source of
  truth in `src/index.d.ts` and `README.md`.
