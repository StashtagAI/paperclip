// Screen recordings are a phone-only capture (HAN-11); the web build never calls these.
const unsupported = () => Promise.reject(new Error('Screen recordings are only supported in the iOS and Android app.'));

export default {
  extractFramesAsync: unsupported as (uri: string, intervalMs: number, maxFrames: number, maxSize: number) => Promise<string[]>,
  extractAudioAsync: unsupported as (uri: string, maxSeconds: number) => Promise<string | null>,
};
