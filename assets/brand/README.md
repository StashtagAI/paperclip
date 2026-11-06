# Pin icon originals

The board's finished concept B "Pin" assets from HAN-10, kept verbatim as the reference.
The app does not load these files: `src/constants/brand.ts` reproduces their geometry and
`src/constants/__tests__/brand.test.ts` checks it still matches. Run `npm run icons` to
regenerate the PNGs in `assets/images/` after changing either.

- `pin-icon-primary.svg`: iOS app icon (white pin, Cobalt # on a Cobalt tile)
- `pin-icon-dark.svg`: iOS dark icon (Night tile, `#4C9BFF` pin)
- `pin-icon-light.svg`, `pin-icon-mono.svg`: alternates, not used yet
- `pin-favicon-24.svg`: heavier strokes for tiny sizes (web favicon)
