This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Accessibility

The app must work with the phone's assistive features: VoiceOver/TalkBack, larger text, Bold Text, Reduce Motion, Increase Contrast, and keyboard use on web. The bar is WCAG 2.2 AA plus Apple's and Google's accessibility guidelines.

A user-facing change is not done until it meets this definition of done:

1. Every control has a spoken name, role, and state. Icon-only buttons get an `accessibilityLabel`.
2. Text scales with the OS setting, and the layout still works at the largest size.
3. Contrast is at least 4.5:1 for text (3:1 for large text and icons). New colors go through `src/constants/__tests__/theme.test.ts`. Never use color alone to carry meaning.
4. Touch targets are at least 44pt (iOS) / 48dp (Android); use `hitSlop` if needed.
5. Async changes are announced: loading, done, and errors. iOS needs `AccessibilityInfo.announceForAccessibility`; live regions are Android-only.
6. Focus is handled for modals, sheets, and navigation.
7. Animations respect Reduce Motion.
8. Images and media that carry information have alt text or captions. Decorative ones are hidden from screen readers.
9. The feature is tested with VoiceOver or TalkBack at least once before handoff.

Guardrails:

- `npm run lint` includes `eslint-plugin-react-native-a11y` (see `eslint.config.js`) and runs in CI. It catches missing roles/labels on touchables and inputs, invalid accessibility props, and nested touchables. Don't run `--fix` for these rules: the autofix inserts placeholder labels instead of real names.
- `src/constants/__tests__/theme.test.ts` is the contrast gate. Add every new color pair there.
- Lint and tests only cover part of the list. Items 2, 5, 6, 7 and 9 need a manual check; say in the PR which ones you checked and how (the PR template has the checklist).
