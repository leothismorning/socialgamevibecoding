# Light Gallery Visual Refinement · Design QA

- Source visual truth: the user's attached light-theme and motion specification
- Code baseline: `origin/main` at `764083f6974f9adc63b92330a5ef2668b2f652ee`
- Implementation branch: `codex/main-visual-effects`
- Local URL: `http://localhost:3000/`
- Browser: Codex in-app Browser
- Tested viewports: 1280 × 720 and 390 × 844

## Visual evidence

- `design-qa-assets/main-visual-effects/19-before-after-comparison.png` — same-size dark branch capture and final light desktop capture in one comparison image
- `design-qa-assets/main-visual-effects/10-light-lottery-1280x720.png` — authoritative round-one lottery result at desktop size
- `design-qa-assets/main-visual-effects/14-contributor-flipped-1280x720.png` — Contributor back face and seat picker
- `design-qa-assets/main-visual-effects/15-like-ring-1280x720.png` — real like action during the 780ms edge-ring animation
- `design-qa-assets/main-visual-effects/17-mobile-lottery-390x844.png` — mobile lottery layout
- `design-qa-assets/main-visual-effects/18-mobile-role-cards-390x844.png` — mobile Guest role selection

The screenshot files remain local QA artifacts and are intentionally excluded from Git.

## Visible comparison

The page hierarchy and product labels remain unchanged. Compared with the previous dark branch capture, the active UI now uses a white page, white or pale-mint cards, `#111` primary text, `#66706B` secondary text, mint borders, and restrained green feedback. Large dark surfaces, persistent spotlights, custom cursor decoration, and card tilt have been removed. Black is retained only for compact white-text notices and the debug control.

## Browser interaction checks

- Clicked Host, Creator, and Contributor role cards in the live UI. All three completed the 3D flip.
- Selected backs contained zero SVG icons. Computed front state was `opacity: 0` and `visibility: hidden`; back text stayed unobstructed.
- Entered the P02 Contributor identity through the live seat picker.
- Moved the pointer across role cards. Before/after computed transforms remained `none`, no inline style variables were added, and no custom cursor element/class existed.
- Clicked the Mint C02 like control through the live UI. The displayed value changed from 0 to 1 once. The decoration reported `gallery-light-action-ring`, `0.78s`, and `pointer-events: none`.
- Opened the existing round-one lottery modal. Its three displayed selected comments matched the authoritative results already returned by the current API state; no client-side random result was introduced.
- Opened Mint C02 detail and inspected the actual round history. Computed history background was `rgb(199, 248, 251)`, with `rgb(17, 17, 17)` text.
- Existing failure notices computed as black backgrounds with white text.
- Horizontal overflow was false at both 1280 × 720 and 390 × 844.
- Browser console warnings/errors: none in the tested desktop Contributor, desktop Guest, and mobile Guest tabs.
- A `prefers-reduced-motion: reduce` rule was found in the live stylesheet. The test machine did not currently request reduced motion, so the normal finite animations were exercised.

## Business-safety checks

- Active entry remains `src/main.tsx -> GalleryApp`.
- Existing role, seat, like, comment, round, development, lottery, and session-storage handlers remain in place.
- Visual wrappers do not issue additional requests and decorative layers ignore pointer input.
- No server, API, database, route, type, request-parameter, permission, or protected business file was changed.
- The current Gallery state has lottery results but no independent authoritative Winner field or Winner decision. `WinnerPresentation` and `TrophyIcon` are reusable visual-only components and are deliberately not mounted, so no Winner is guessed or fabricated.

## Known environment limit

The existing local round-one AI development job reports `SUIXIANG_API_KEY is not configured on the server.` This is an environment configuration issue already exposed by the current product flow. No fallback or business change was added. Lottery rendering, role selection, likes, history, responsive layout, and visual effects were still testable.

## Result

Passed the active visual flow with no remaining actionable P0, P1, or P2 visual defect in the tested states.
