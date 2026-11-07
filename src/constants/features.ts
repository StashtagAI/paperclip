/**
 * Feature flags. Flip in code; there is no remote config for the beta.
 */
export const Features = {
  /** "Shared" stashes with a partner or group: a later Premium-tier feature (HAN-10), hidden for the MVP. */
  shared: false,
} as const;
