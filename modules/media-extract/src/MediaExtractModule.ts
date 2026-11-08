import { NativeModule, requireNativeModule } from 'expo';

declare class MediaExtractModule extends NativeModule {
  /** JPEG frames every `intervalMs`, longest side at most `maxSize` px. Returns file:// URIs in the cache dir. */
  extractFramesAsync(uri: string, intervalMs: number, maxFrames: number, maxSize: number): Promise<string[]>;
  /** First audio track as 16 kHz mono 16-bit PCM WAV (whisper.rn input), or null when there is no audio. */
  extractAudioAsync(uri: string, maxSeconds: number): Promise<string | null>;
}

export default requireNativeModule<MediaExtractModule>('MediaExtract');
