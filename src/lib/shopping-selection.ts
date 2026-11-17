import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * The recipes picked for the shopping list (HAN-74) and the lines ticked off so far. One copy shared by every list
 * screen, so recipes can be picked from several lists. Saved on the device, so the list is still there in the shop
 * after the app has been closed.
 */
type State = { ids: string[]; checked: string[] };

const KEY = 'stashtag.shopping-list';
let state: State = { ids: [], checked: [] };
let loaded = false;
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loaded) {
    loaded = true;
    AsyncStorage.getItem(KEY)
      .then((saved) => {
        const s = saved ? (JSON.parse(saved) as Partial<State>) : null;
        // Anything picked before the saved copy finished loading wins.
        if (s && !state.ids.length) {
          state = { ids: Array.isArray(s.ids) ? s.ids : [], checked: Array.isArray(s.checked) ? s.checked : [] };
          listeners.forEach((l) => l());
        }
      })
      .catch(() => {});
  }
  return () => {
    listeners.delete(listener);
  };
}

export function toggleRecipe(id: string) {
  set({ ids: state.ids.includes(id) ? state.ids.filter((i) => i !== id) : [...state.ids, id] });
}

export function toggleChecked(key: string) {
  set({ checked: state.checked.includes(key) ? state.checked.filter((k) => k !== key) : [...state.checked, key] });
}

/** Drops recipes that no longer exist, e.g. deleted since they were picked. */
export function dropRecipes(ids: string[]) {
  if (ids.some((i) => state.ids.includes(i))) set({ ids: state.ids.filter((i) => !ids.includes(i)) });
}

export function clearShoppingList() {
  set({ ids: [], checked: [] });
}

// Forget the list on sign-out, so the next account on this phone doesn't get it.
supabase.auth.onAuthStateChange((event) => {
  if (event !== 'SIGNED_OUT') return;
  state = { ids: [], checked: [] };
  listeners.forEach((l) => l());
  AsyncStorage.removeItem(KEY).catch(() => {});
});

const snapshot = () => state;

export function useShoppingSelection(): State {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
