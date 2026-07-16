# Design QA — Study workspace layout

Reference: `c9e6471b966db17b3efe341930e5b71e.png`

Implementation: `http://localhost:3000/`

## Comparison summary

- Desktop structure matches the requested information path: fixed project/room rail on the left, then Current Prototype, Live Comment Ranking, and Iteration Timeline in one right-hand content column.
- The former narrow feedback rail is removed. Comment ranking and its composer now use the full main-column width.
- The participant roster is condensed to a five-column seat grid inside the information rail.
- The version area uses only real stored versions and renders each version's real HTML as a non-interactive thumbnail. No extra version data or avatar imagery is fabricated.
- At 390 × 844, all sections stack into one column, the document has no horizontal overflow (`scrollWidth = 390`), and the comment/timeline controls remain readable.

## Findings resolved

- P1 layout: removed the three-column workbench relationship that constrained comments to a narrow rail.
- P1 responsiveness: added explicit 960px, 720px, and 480px adaptations for the information rail, leaderboard rows, header controls, and timeline.
- P2 hierarchy: moved project description, room facts, occupancy, balance, selected count, and phase control into the sidebar.
- P2 fidelity: enlarged the preview as the primary visual and preserved the reference's top-to-bottom reading order.
- P2 version visibility: added real version previews and a continuing-path state for experiments that currently contain only one version.

## Verification

- `npm run lint`: passed.
- `npm run build`: passed.
- Browser console: no application runtime errors; only the project's existing Tailwind CDN production warning is present in development.
- Desktop viewport checked at 1280 × 720.
- Mobile viewport checked at 390 × 844 with no horizontal overflow.

final result: passed

---

# Dark mode contrast QA

## Reference sources

- `/Users/chenyutong/Desktop/截屏2026-07-15 22.55.37.png` — archive hero description and Round progress title.
- `/Users/chenyutong/Desktop/截屏2026-07-15 22.52.39.png` — dark sidebar hierarchy and values.
- `/Users/chenyutong/Desktop/截屏2026-07-15 22.55.29.png` — ABORTED badge contrast.
- `/Users/chenyutong/Desktop/截屏2026-07-15 22.55.11.png` — iteration timeline labels, headings, body copy, and glow interference.

## Implementation captures

- `/Users/chenyutong/.codex/visualizations/2026/07/13/019f594e-f277-7090-b790-1407ab895aea/dark-contrast-workbench.png`
- `/Users/chenyutong/.codex/visualizations/2026/07/13/019f594e-f277-7090-b790-1407ab895aea/dark-contrast-archive.png`

Viewport: 1280 × 720, in-app browser. States: active Creator workbench in Investing phase and a read-only aborted archive. Theme was explicitly switched to Dark; Light was then checked separately.

## Comparison findings

1. Sidebar headings, body copy, values, and occupied-seat labels now use explicit high-contrast dark-surface colors instead of inherited low-opacity colors.
2. Light cards inside dark mode use black/deep-green text; Round progress and timeline titles no longer inherit white text.
3. Light badges use deep-green text on pale cyan; dark badges use white text. ABORTED, phase, snapshot, and current-version states follow the same pairing.
4. Archive hero copy is fully opaque pale cyan, while the decorative spotlight is smaller and fainter.
5. Timeline kicker, metadata, description, future-step copy, and version status are all legible while retaining hierarchy.
6. Light mode retains the original white card surfaces and dark card titles.

## Iteration history

- Baseline: captured the dark workbench with unreadable sidebar and timeline text.
- Pass 1: introduced surface-aware text and badge tokens plus component-scoped dark overrides.
- Pass 2: verified computed colors in the workbench and archive, reduced spotlight/cursor interference, and confirmed Light theme isolation.

Final result: pass. No layout or business logic changed.
