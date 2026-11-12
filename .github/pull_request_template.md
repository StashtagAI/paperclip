## What & why

<!-- What changed, and the issue it closes (e.g. HAN-123). -->

## How it was tested

<!-- Commands run, devices/simulators used. -->

## Accessibility

<!-- Required for user-facing changes; see "Accessibility" in AGENTS.md. Tick what you checked and say how. Write "n/a: <reason>" for items that don't apply, or "No user-facing change" and skip the list. -->

- [ ] Every control has a spoken name, role, and state; icon-only buttons have an `accessibilityLabel`
- [ ] Text scales with the OS setting; layout works at the largest size
- [ ] Contrast ≥ 4.5:1 text (3:1 large text/icons); new colors added to `src/constants/__tests__/theme.test.ts`; color is never the only signal
- [ ] Touch targets ≥ 44pt / 48dp (`hitSlop` if needed)
- [ ] Async changes announced (loading/done/error); iOS via `AccessibilityInfo.announceForAccessibility`
- [ ] Focus handled for modals, sheets, and navigation
- [ ] Animations respect Reduce Motion
- [ ] Informative media has alt text/captions; decorative elements hidden from screen readers
- [ ] Tested with VoiceOver or TalkBack (which one, which device):
