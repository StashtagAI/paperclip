import { itemSearchFilter } from '@/lib/search';

describe('itemSearchFilter', () => {
  it('returns null for blank input', () => {
    expect(itemSearchFilter('   ')).toBeNull();
    expect(itemSearchFilter('#')).toBeNull();
  });

  it('matches name or tag for a single word, ignoring a leading #', () => {
    expect(itemSearchFilter('#Brunch')).toBe('name.ilike."%Brunch%",tags.cs.{brunch}');
  });

  it('only searches names for multi-word queries', () => {
    expect(itemSearchFilter('lemon chicken')).toBe('name.ilike."%lemon chicken%"');
  });

  it('escapes LIKE wildcards and PostgREST reserved characters', () => {
    expect(itemSearchFilter('50%_off')).toBe('name.ilike."%50\\\\%\\\\_off%"');
    expect(itemSearchFilter('a"),id.eq.(x')).toBe('name.ilike."%a\\"),id.eq.(x%"');
  });
});
