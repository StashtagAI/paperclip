import { toError } from '@/lib/errors';

describe('toError', () => {
  it('keeps real errors as they are', () => {
    const error = new Error('boom');
    expect(toError(error)).toBe(error);
  });

  it('reads the message of a plain PostgREST error object instead of "[object Object]"', () => {
    const error = toError({
      code: 'PGRST201',
      details: [],
      hint: null,
      message: "Could not embed because more than one relationship was found for 'items' and 'links'",
    });
    expect(error.message).toBe("Could not embed because more than one relationship was found for 'items' and 'links'");
    expect(error).toMatchObject({ code: 'PGRST201' });
  });

  it('uses strings as the message', () => {
    expect(toError('offline').message).toBe('offline');
  });

  it('falls back to a generic message for anything else', () => {
    expect(toError({}).message).toBe('Something went wrong.');
    expect(toError(undefined).message).toBe('Something went wrong.');
    expect(toError({ message: '' }).message).toBe('Something went wrong.');
  });
});
