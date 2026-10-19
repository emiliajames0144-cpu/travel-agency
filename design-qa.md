# Hero layout and carousel verification

The hero uses a centered grid stage beneath the 78px header, with the copy, active-card frame, and left progress rail sharing a measured vertical center. The active destination name is the shared value for the heading, active card label, ghost title, and counter state.

## Measured desktop layout

Using `getBoundingClientRect()` in the live page at 1440px wide:

| Viewport height | Copy center | Active card center | Rail center | Header-to-card top gap | Card-to-hero bottom gap |
| --- | ---: | ---: | ---: | ---: | ---: |
| 768px | 423px | 423px | 423px | 132.5px | 132.5px |
| 900px | 489px | 489px | 489px | 198.5px | 198.5px |
| 1080px | 579px | 579px | 579px | 288.5px | 288.5px |

At 390 × 844, the narrow layout stacks copy above cards. The combined copy-and-card group is centered between the header and hero bottom with 118px gaps; the rail center (456px) aligns with the combined group center. Text and cards use a stacked layout on narrow screens, so they do not share one individual center line there.

## Carousel checks

- Advanced through all five destinations, including 05 → 01. Sequence checked: 04, 05, 01, 02, 03, 04.
- Reversed through all five destinations, including 01 → 05. Sequence checked: 04, 03, 02, 01, 05, 04.
- At each settled state, the heading, faded title, active card label, background image, and current counter matched.
- Repeated requests are locked during the 720ms track motion and short rebase step. The outgoing card fades away before the duplicated loop card is reused.
- `node --check assets/site.js` passes. No build or lint scripts are provided in this static project.

Keyboard focus remains on the active card after a key-driven advance, using `focus({preventScroll:true})` so cycling offscreen duplicates does not scroll the page.

The 320 × 740 compact-phone preview also keeps the destination cards and bottom controls in view. The card step tightens slightly between 901px and 1200px wide so the third portrait remains visible at the default preview width.
