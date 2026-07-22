# Main Visual Effects Design QA

- Source visual truth: current production at `https://socialgamevibecoding-production.up.railway.app`
- Code baseline: `origin/main` at `764083f6974f9adc63b92330a5ef2668b2f652ee`
- Implementation URL: `http://127.0.0.1:3000/`
- Desktop viewport: 1280 × 720
- Mobile viewport: 390 × 844
- Browser: Codex in-app Browser

## Evidence

- `design-qa-assets/main-visual-effects/01-online-main-1280x720.png` — production baseline
- `design-qa-assets/main-visual-effects/02-local-guest-1280x720.png` — local Guest state
- `design-qa-assets/main-visual-effects/03-local-host-flipped-1280x720.png` — Host flip and seat picker
- `design-qa-assets/main-visual-effects/04-local-creator-flipped-1280x720.png` — Creator flip and seats
- `design-qa-assets/main-visual-effects/05-local-contributor-flipped-1280x720.png` — Contributor flip and seats
- `design-qa-assets/main-visual-effects/06-local-like-ring-1280x720.png` — real like action and feedback
- `design-qa-assets/main-visual-effects/08-local-lottery-animation-1280x720.png` — authoritative lottery result modal
- `design-qa-assets/main-visual-effects/09-local-round-history-1280x720.png` — ice-blue round history
- `design-qa-assets/main-visual-effects/10-local-mobile-390x844.png` — mobile lottery animation
- `design-qa-assets/main-visual-effects/11-local-mobile-roles-390x844.png` — mobile role layout
- `design-qa-assets/main-visual-effects/12-local-black-tooltip-1280x720.png` — black/white tooltip

## Visible comparison

Production and the local branch were captured in the same 1280 × 720 viewport and Guest state. The content structure is unchanged: fixed header, status strip, role selection, and public gallery remain in the same order. The local branch changes only the visual system from pale blue/violet to black, ice blue, and mint green. The current product labels and roles remain Host, Creator, and Contributor.

## Interaction checks

- Selected Host, Creator, and Contributor through the live UI; seat controls appeared normally.
- Role fronts contain the solid icon; selected backs contain zero SVG icons. Computed state after flip: front `opacity: 0`, front `visibility: hidden`, back `backface-visibility: hidden`.
- Pointer movement changed card CSS tilt/glow variables without React state updates.
- Published three fixture Apps through the Creator upload/publish UI so Contributor and downstream flows could be exercised.
- One Contributor like changed the displayed count from 0 to 1 once and produced the ring animation.
- Submitted one real comment to each App, ended round 1 through Host controls, and observed the modal values match the three stored results returned by the existing flow.
- Round history computed colors: background `rgb(199, 248, 251)`, text `rgb(0, 0, 0)`.
- Tooltip computed colors: black background, white text, ice-blue border; it remained visible through the pointer spotlight state.
- Document horizontal overflow was 0px at 1280 × 720 and 390 × 844.
- Browser console warnings/errors: none in Host, Contributor, and mobile Guest tabs.
- Refresh preserved the assigned role and current study data through the existing session and API flow.
- A `prefers-reduced-motion: reduce` stylesheet rule is present and disables new strong animation/tilt effects.

## Current-main differences and limits

- Latest `main` has no authoritative Winner field or Winner determination in the active Gallery flow. No Winner or trophy was fabricated, because doing so would alter or guess business semantics.
- The active product role is named Contributor and uses P01–P20 codes. It was not renamed to the legacy Participant label.
- Local AI redevelopment reached the existing failure state because `SUIXIANG_API_KEY` is not configured. Lottery state, result rendering, role flow, comments, likes, and visual QA still completed; no API fallback was added.

## Result

No actionable visual P0, P1, or P2 issue remains in the tested active flow. Final result: passed with the latest-main Winner limitation documented above.
