import { currentStep, STEPS, stepAnnouncement } from '@/lib/progress';
import type { LinkDetail } from '@/lib/types';

const link = (status: LinkDetail['status'], raw_content: LinkDetail['raw_content'] = null) => ({ status, raw_content });

describe('currentStep', () => {
  it('starts at reading after Stash it and at finding after the capture screen', () => {
    expect(currentStep(link('pending'), true, 'read')).toBe('reading');
    expect(currentStep(link('pending'), true, '1')).toBe('finding');
  });

  it('is null for a pending link nobody is sending (waiting for text)', () => {
    expect(currentStep(link('pending'), false, 'read')).toBeNull();
    expect(currentStep(link('pending'), false)).toBeNull();
  });

  it('follows the stage process-link writes', () => {
    expect(currentStep(link('processing', { reading: true, stage: 'reading' }), false)).toBe('reading');
    expect(currentStep(link('processing', { reading: false, stage: 'finding' }), false)).toBe('finding');
    expect(currentStep(link('processing', { stage: 'filing' }), false)).toBe('filing');
  });

  it('falls back for rows without a stage', () => {
    expect(currentStep(link('processing', { reading: true }), false)).toBe('reading');
    expect(currentStep(link('processing'), false)).toBe('finding');
    expect(currentStep(link('processing', { stage: 'bogus' as never }), false)).toBe('finding');
  });

  it('is null once the card is done or failed', () => {
    expect(currentStep(link('done', { stage: 'filing' }), true, 'read')).toBeNull();
    expect(currentStep(link('failed'), true, 'read')).toBeNull();
  });
});

describe('stepAnnouncement', () => {
  it('says which step of how many', () => {
    expect(stepAnnouncement('reading')).toBe(`Step 2 of ${STEPS.length}: Reading the post`);
    expect(stepAnnouncement('filing')).toBe(`Step 4 of ${STEPS.length}: Sorting them into your lists`);
  });
});
