// Transcription runs on the phone only (HAN-11); the web build offers paste caption and screenshots.
export const MODEL_LABEL = '';
export const isModelDownloaded = () => false;
export const downloadModel = async (): Promise<void> => {
  throw new Error('Screen recordings are only supported in the iOS and Android app.');
};
export const transcribeWav = async (): Promise<{ text: string; ms: number }> => {
  throw new Error('Screen recordings are only supported in the iOS and Android app.');
};
