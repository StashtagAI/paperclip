import { toCaptured, type Segment } from '@/lib/capture/draft';
import { clip, dedupeLines, lineKey, MAX_CAPTURED_CHARS } from '@/lib/capture/lines';

const seg = (source: Segment['source'], text: string, status: Segment['status'] = 'ready'): Segment => ({
  id: `${source}-${text}`,
  source,
  label: source,
  status,
  text,
});

describe('dedupeLines', () => {
  it('drops overlay lines repeated across frames, keeping first-seen order', () => {
    expect(dedupeLines(['1 cup rice\n2 eggs', '1 cup rice\n2 eggs', '2 eggs\nSoy sauce'])).toEqual([
      '1 cup rice',
      '2 eggs',
      'Soy sauce',
    ]);
  });

  it('treats case, accents and punctuation as the same line', () => {
    expect(dedupeLines(['Café Bar!', 'cafe bar'])).toEqual(['Café Bar!']);
    expect(lineKey('  Sap — Sua  ')).toBe('sap sua');
  });

  it('keeps the more complete reading of a half-scrolled line', () => {
    expect(dedupeLines(['1 cup', '1 cup jasmine rice'])).toEqual(['1 cup jasmine rice']);
  });

  it('ignores empty and punctuation-only lines', () => {
    expect(dedupeLines(['', '  \n...\n•'])).toEqual([]);
  });
});

describe('toCaptured', () => {
  it('maps sources onto the process-link fields and skips unfinished segments', () => {
    expect(
      toCaptured([
        seg('caption', 'Best brunch in Denver'),
        seg('screenshot', 'Sap Sua\nHey Kiddo'),
        seg('recording_text', 'Hey Kiddo\nTavernetta'),
        seg('recording_audio', 'first up is sap sua'),
        seg('screenshot', 'still reading', 'working'),
        seg('screenshot', 'broken', 'failed'),
      ]),
    ).toEqual({
      caption: 'Best brunch in Denver',
      transcript: 'first up is sap sua',
      ocr: 'Sap Sua\nHey Kiddo\nTavernetta',
    });
  });

  it('omits empty fields', () => {
    expect(toCaptured([seg('caption', '   ')])).toEqual({});
  });

  it('clips each field to the server limit', () => {
    expect(clip('x'.repeat(MAX_CAPTURED_CHARS + 5))).toHaveLength(MAX_CAPTURED_CHARS);
  });
});
