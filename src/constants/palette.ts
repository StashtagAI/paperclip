// No imports: also loaded by scripts/build-icons.mjs under plain Node.

/** Named brand swatches, exactly as in the brief. */
export const Palette = {
  light: {
    cobalt: '#1F6FEB', // primary, Trips
    mint: '#19C48D', // Eats
    aqua: '#3DD9D6', // Recipes, highlights
    indigo: '#5A5CF0', // Do
    ink: '#0B1B2B', // text
    slate: '#52627A', // muted text
    mist: '#F4F9FF', // background
    white: '#FFFFFF',
  },
  dark: {
    night: '#0A1420', // background
    surface: '#122233', // cards
    cobalt: '#4C9BFF',
    mint: '#3DE0A6',
    aqua: '#5CEBEA',
    indigo: '#8C8DFF',
    cloud: '#EAF3FF', // text
  },
} as const;
