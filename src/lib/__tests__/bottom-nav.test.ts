import { selectedTab, tabAction, visibleTabs } from '@/lib/bottom-nav';

describe('selectedTab', () => {
  it('matches the four tab screens', () => {
    expect(selectedTab('/')).toBe('home');
    expect(selectedTab('/shopping-list')).toBe('shopping');
    expect(selectedTab('/nudges')).toBe('nudges');
    expect(selectedTab('/profile')).toBe('profile');
  });

  it('ignores a trailing slash', () => {
    expect(selectedTab('/profile/')).toBe('profile');
  });

  it('selects nothing on screens inside a tab', () => {
    expect(selectedTab('/list/abc')).toBeNull();
    expect(selectedTab('/card/abc')).toBeNull();
    expect(selectedTab('/s/token')).toBeNull();
    expect(selectedTab('/feedback')).toBeNull();
  });
});

describe('tabAction', () => {
  it('does nothing for the tab already showing', () => {
    expect(tabAction('home', '/')).toBe('none');
    expect(tabAction('shopping', '/shopping-list')).toBe('none');
    expect(tabAction('profile', '/profile')).toBe('none');
  });

  it('pops back to Home from anywhere', () => {
    expect(tabAction('home', '/list/abc')).toBe('home');
    expect(tabAction('home', '/s/token')).toBe('home');
    expect(tabAction('home', '/profile')).toBe('home');
  });

  it('opens Profile over Home, and Shopping list and Nudges on top of the current screen', () => {
    expect(tabAction('profile', '/recipe/abc')).toBe('root');
    expect(tabAction('shopping', '/recipe/abc')).toBe('push');
    expect(tabAction('nudges', '/')).toBe('push');
  });
});

describe('visibleTabs', () => {
  it('drops Nudges where they are not supported', () => {
    expect(visibleTabs(true)).toEqual(['home', 'shopping', 'nudges', 'profile']);
    expect(visibleTabs(false)).toEqual(['home', 'shopping', 'profile']);
  });
});
