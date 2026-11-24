import {
  FAILED_TITLE,
  failureReason,
  isNotSorted,
  linkStatusLabel,
  NOT_SORTED_TITLE,
  NOT_STARTED,
  retryAction,
  settledMessage,
} from '@/lib/link-outcome';

describe('failureReason', () => {
  it('says known codes in words', () => {
    expect(failureReason('timeout')).toBe('This took too long and was stopped.');
    expect(failureReason(NOT_STARTED)).toMatch(/Couldn’t reach the server/);
  });

  it('never shows a raw code', () => {
    expect(failureReason('something_new')).toBe('Something went wrong while reading it.');
    expect(failureReason(null)).toBe('Something went wrong while reading it.');
  });
});

describe('retryAction', () => {
  it('runs a timed-out or server-side failure again', () => {
    expect(retryAction('failed', 'timeout')).toBe('rerun');
    expect(retryAction('failed', 'quota_unavailable')).toBe('rerun');
    expect(retryAction('failed', null)).toBe('rerun');
  });

  it('asks for new text when the text was the problem', () => {
    expect(retryAction('failed', 'no_items_found')).toBe('capture');
    expect(retryAction('failed', 'no_captured_text')).toBe('capture');
    expect(retryAction('failed', 'run_budget')).toBe('capture');
  });

  it('offers Premium over the monthly allowance (HAN-132)', () => {
    expect(retryAction('failed', 'monthly_limit')).toBe('upgrade');
    expect(failureReason('monthly_limit')).toMatch(/Premium lifts the limit/);
  });

  it('has nothing to retry for a link that is not allowed, or one that did not fail', () => {
    expect(retryAction('failed', 'url_not_allowed')).toBeNull();
    expect(retryAction('done', null)).toBeNull();
    expect(retryAction('processing', null)).toBeNull();
  });

  it('resends a request that never started, unless its text came from the capture screen', () => {
    expect(retryAction('pending', NOT_STARTED, 'read')).toBe('rerun');
    expect(retryAction('pending', NOT_STARTED, '1')).toBe('capture');
  });
});

describe('settledMessage', () => {
  const row = (id: string, status: 'pending' | 'processing' | 'failed', error: string | null = null) => ({
    id,
    status,
    error,
    post: `post ${id}`,
  });

  it('says when a link being sorted fails, with why', () => {
    expect(settledMessage([row('a', 'processing')], [row('a', 'failed', 'timeout')])).toBe(
      `${FAILED_TITLE}: post a. This took too long and was stopped.`,
    );
  });

  it('says when a link being sorted is filed (it leaves the list)', () => {
    expect(settledMessage([row('a', 'processing')], [])).toBe('Sorted: post a');
  });

  it('is quiet when nothing that was being sorted changed', () => {
    expect(settledMessage([row('a', 'processing')], [row('a', 'processing')])).toBeNull();
    expect(settledMessage([row('a', 'pending')], [])).toBeNull();
    expect(settledMessage([row('a', 'failed', 'timeout')], [row('a', 'failed', 'timeout')])).toBeNull();
  });
});

describe('not sorted (HAN-89)', () => {
  it('is a done link with nothing filed and nothing already listed', () => {
    expect(isNotSorted('done', 0, 0)).toBe(true);
    expect(isNotSorted('done', 1, 0)).toBe(false);
    expect(isNotSorted('done', 0, 2)).toBe(false);
    expect(isNotSorted('pending', 0, 0)).toBe(false);
  });

  it('is labelled "Not sorted", never "Filed"', () => {
    expect(linkStatusLabel({ status: 'done', not_sorted: true })).toBe(NOT_SORTED_TITLE);
    expect(linkStatusLabel({ status: 'done', not_sorted: false })).toBe('Filed');
    expect(linkStatusLabel({ status: 'pending' })).toBe('Needs text');
  });

  it('is read out when a link being sorted ends up not sorted', () => {
    const before = [{ id: 'a', status: 'processing' as const, error: null, post: 'post a' }];
    const after = [{ id: 'a', status: 'done' as const, error: null, post: 'post a', not_sorted: true }];
    expect(settledMessage(before, after)).toBe('Not sorted: post a. Nothing in it could be sorted into a list');
  });
});
