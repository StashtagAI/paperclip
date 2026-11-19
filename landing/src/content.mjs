// Page copy. The visible page, the JSON-LD and llms.txt are all built from this file, so the FAQ that
// search engines and LLMs quote always matches what visitors see. Plain text only: no HTML.

import { readFileSync } from 'node:fs';

// The waitlist copy (and its FAQ entry) depends on which store listings are live.
const config = JSON.parse(readFileSync(new URL('../site.config.json', import.meta.url), 'utf8'));
const missing = [!config.appStore.url && 'the App Store', !config.googlePlay.url && 'Google Play'].filter(Boolean);
/** Store names still to launch, e.g. "the App Store and Google Play". Empty once both listings are live. */
export const comingSoon = missing.join(' and ');

export const title = 'StashtagAI: save Instagram and TikTok posts as organized lists';

export const description =
  'StashtagAI turns the Instagram and TikTok posts you save into organized lists, like Restaurants › Denver, ' +
  'with places on a map and lists you can share. Free on iPhone and Android.';

export const tagline = 'Save the post. Get the list.';

export const valueProp =
  'Share an Instagram or TikTok post to StashtagAI and it becomes an organized list, like Restaurants › Denver, ' +
  'with every place, recipe or idea from the post ready to use.';

/** The app's category names, as in KIND_LABELS (../src/lib/types.ts); check.mjs keeps the two in step. */
export const categories = ['Eats', 'Travel', 'Recipes', 'Do', 'Shop', 'Watch & read'];

/** Names the app no longer uses. check.mjs fails if one shows up on the site. */
export const retiredCategories = ['Trips'];

/** Alt text for the hero screenshot (og/home.html). Keep the tile names in step with that file. */
export const heroAlt =
  'The StashtagAI home screen: tiles for Eats, Travel, Recipes and Do, above a Recently stashed list of a café, ' +
  'a ridge walk and a recipe saved from Instagram.';

export const steps = [
  {
    title: 'Share a post',
    text: 'Tap Share on any Instagram or TikTok post and choose StashtagAI, or paste the link into the app.',
  },
  {
    title: 'StashtagAI reads it',
    text: 'It reads the caption, the text on screen and the voiceover, and picks out every restaurant, place, recipe or idea.',
  },
  {
    title: 'Find it in your lists',
    text: 'Each one is filed into a list such as Eats › Restaurants › Denver, ready when you need it.',
  },
];

export const features = [
  {
    kind: 'eats',
    title: 'Eats, Travel, Recipes and Do',
    text: 'Restaurants, trip ideas, recipes and things to try are sorted for you into lists by type and place.',
  },
  {
    kind: 'travel',
    title: 'Places on a map',
    text: 'See every saved spot on a map, so you know what is near you before you head out.',
  },
  {
    kind: 'recipes',
    title: 'Details filled in',
    text: 'Addresses, ratings, opening hours and ingredients are pulled out, so you do not have to rewatch the video.',
  },
  {
    kind: 'do',
    title: 'Shared lists',
    text: 'Send a list to friends with a link, whether it is a date-night shortlist or a whole trip plan.',
  },
];

export const faq = [
  {
    q: 'How do I save restaurants from Instagram?',
    a:
      'Open the Instagram post or reel, tap Share, and choose StashtagAI. StashtagAI finds every restaurant the post ' +
      'mentions and saves them to a list such as Eats › Restaurants › Denver, with addresses and a map.',
  },
  {
    q: 'Can I save TikTok videos to a list?',
    a:
      'Yes. Share the TikTok video to StashtagAI or paste its link. StashtagAI reads the caption, on-screen text and ' +
      'voiceover, then files the places, recipes or ideas it finds into the right list.',
  },
  {
    q: 'How is this different from Instagram saved collections?',
    a:
      'Instagram collections save the post. StashtagAI saves what is in it: each restaurant, place or recipe becomes ' +
      'its own entry with details and a map pin, grouped by type and city, so you can find it without rewatching.',
  },
  {
    q: 'Can I share a list with friends?',
    a:
      'Yes. Share any list with a link, and friends who sign in to StashtagAI can see the same places and add the ' +
      'list to their own, which is handy for a trip or a night out.',
  },
  ...(comingSoon
    ? [
        {
          q: 'When can I download StashtagAI?',
          a:
            `StashtagAI is coming soon to ${comingSoon}. Join the launch waitlist on ${new URL(config.siteUrl).host} with your ` +
            'email address, and we will email you when it is available. We only use the address for that.',
        },
      ]
    : []),
  {
    q: 'Is StashtagAI free?',
    a: `StashtagAI ${missing.length === 2 ? 'will be' : 'is'} free to download on iPhone and Android.`,
  },
  {
    q: 'Which phones does StashtagAI work on?',
    a: 'StashtagAI is an app for iPhone (iOS) and Android phones, from the App Store and Google Play.',
  },
];

/** The launch waitlist form, shown in place of a store button until that listing is live (HAN-100). */
export const waitlist = {
  intro: `Coming soon to ${comingSoon}. Join the waitlist and we will email you when StashtagAI is out.`,
  emailLabel: 'Email address',
  platformLegend: 'Your phone (optional)',
  submit: 'Join the waitlist',
  note: 'We only use your email to tell you about the launch.',
  sending: 'Adding you to the waitlist…',
  done: "Thanks, you're on the list. We'll email you when StashtagAI is out.",
  invalid: 'Enter a complete email address, like name@example.com.',
  limited: 'Too many tries from this connection. Wait a few minutes, then try again.',
  failed: `Something went wrong and you were not added. Try again, or email ${config.contactEmail}.`,
  thanksTitle: "You're on the list",
  thanksText: `Thanks. We'll email you when StashtagAI is on ${comingSoon || 'the App Store and Google Play'}. That is the only thing we use your address for.`,
  tryAgainTitle: "We couldn't add you",
  tryAgainText:
    'Check that the email address is complete, like name@example.com. If it is, there may have been too many tries ' +
    'from this connection: wait a few minutes, then try again.',
};

/** Legal pages, built from the Markdown in ../legal so the store listings and the site share one copy. */
export const legalPages = [
  { file: 'privacy-policy.md', slug: 'privacy', label: 'Privacy Policy' },
  { file: 'terms-of-service.md', slug: 'terms', label: 'Terms of Service' },
  { file: 'data-deletion.md', slug: 'data-deletion', label: 'Data Deletion' },
  { file: 'support.md', slug: 'support', label: 'Support' },
];
