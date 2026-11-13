import { provenanceOf } from '../provenance';

const item = { edited_at: null, address: null, lat: null };

describe('provenanceOf', () => {
  it('says From the post when the name was read from the post', () => {
    expect(provenanceOf(item, { name: 'capture' }).badge).toBe('From the post');
  });
  it('does not claim the post when sources are missing', () => {
    expect(provenanceOf(item, undefined).badge).toBe('Source not recorded');
    expect(provenanceOf(item, {}).badge).toBe('Source not recorded');
  });
  it('a user edit wins over any recorded source', () => {
    expect(provenanceOf({ ...item, edited_at: '2026-11-13T00:00:00Z' }, { name: 'capture' }).badge).toBe('Edited by you');
  });
  it('calls out an address that did not come from the post', () => {
    const p = provenanceOf({ ...item, address: '1 Main St' }, { name: 'capture', address: 'places_lookup' });
    expect(p.badge).toBe('From the post');
    expect(p.detail).toContain('address is from google places');
  });
  it('labels non-post names', () => {
    expect(provenanceOf(item, { name: 'search' }).badge).toBe('From web search');
  });
});
