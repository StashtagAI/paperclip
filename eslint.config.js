// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const { fixupPluginRules } = require('@eslint/compat');
const expoConfig = require('eslint-config-expo/flat');
const a11y = require('eslint-plugin-react-native-a11y');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'supabase/functions/*'],
  },
  // Accessibility gate (HAN-27). The plugin predates ESLint 9, so its rules go
  // through fixupPluginRules. Don't run `--fix` for these: the autofix inserts
  // placeholder labels like "Text input field" instead of real names.
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: { 'react-native-a11y': fixupPluginRules(a11y) },
    rules: {
      // Touchables and TextInputs need a role or label so screen readers can name them.
      'react-native-a11y/has-accessibility-props': 'error',
      'react-native-a11y/has-valid-accessibility-descriptors': 'error',
      'react-native-a11y/has-valid-accessibility-role': 'error',
      'react-native-a11y/has-valid-accessibility-state': 'error',
      'react-native-a11y/has-valid-accessibility-value': 'error',
      'react-native-a11y/has-valid-accessibility-actions': 'error',
      'react-native-a11y/has-valid-accessibility-live-region': 'error',
      'react-native-a11y/has-valid-important-for-accessibility': 'error',
      'react-native-a11y/has-valid-accessibility-ignores-invert-colors': 'error',
      'react-native-a11y/no-nested-touchables': 'error',
      // Deprecated RN props: flag them so nobody reintroduces the old API.
      'react-native-a11y/has-valid-accessibility-component-type': 'error',
      'react-native-a11y/has-valid-accessibility-traits': 'error',
      'react-native-a11y/has-valid-accessibility-states': 'error',
    },
  },
]);
