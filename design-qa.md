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
