# StashtagAI Privacy Policy

**Effective date:** November 7, 2026
**Last updated:** November 19, 2026

This Privacy Policy explains how [COMPANY LEGAL NAME] ("StashtagAI", "we", "us", or "our") collects, uses, shares, and protects information when you use the StashtagAI mobile and web application (the "Service") or visit our website, stashtag.ai (the "Website").

## 1. Information we collect

**Information you provide**
- **Account information:** your email address, and your password if you choose to set one. You can also sign in with a link or code we email to you.
- **Profile:** the name you choose to show on your profile, if you set one.
- **Links you submit:** URLs of Instagram and TikTok posts you save, including links you share to StashtagAI from another app.
- **Text you capture:** if we can't read a post ourselves, you can paste its caption or pick screenshots or a screen recording of it. Your phone (or, on the web, your browser) reads the text and transcribes any speech, and only that text is sent to us. The screenshots, recordings, and audio stay on your device.
- **Your lists and content:** the categories, lists, items, tags, notes, ratings, and "done" marks in your account, and the photos you add to items along with their descriptions.
- **Sharing:** when you share a list, the email addresses of the StashtagAI users you share it with.
- **Feedback and reports:** feedback you send in the app (with your app version and platform), thumbs up or down on a saved post and the reason you give, and reports that an item is wrong, with any note you add.
- **Communications:** messages you send us, such as support requests.
- **Launch waitlist:** if you join the waitlist on our Website, your email address, the phone platform you choose (iPhone or Android, optional), which form you used, any campaign tags in the link that brought you to the Website (such as utm_source), and the date you signed up. To stop abuse of the form, we also keep a keyed, one-way hash of your IP address for 24 hours; we do not store the IP address itself.

**Information we generate or retrieve**
- **Post content:** for each link you submit, we retrieve publicly available content from the post, which may include the caption, the author's display name or handle, and, where available, a transcript of the audio or text read from the images or video. If an Instagram post's caption doesn't name anything, we may download the post's video so that it can be transcribed and its on-screen text read. We may also visit public websites linked in the post to read details about the places or products it mentions.
- **Extracted results:** recommendations generated from that content, such as place, business, or product names, descriptions, addresses, location coordinates, categories, tags, and recipe ingredients and steps. We also record where each detail came from.
- **Place details:** for places, details from Google Maps such as the address, location, rating, number of ratings, and opening hours.
- **Processing records:** the status of each link (for example, processing, done, failed), error codes, timestamps, what each step produced, and usage counts we use to apply limits.

**Information collected automatically**
- **Device and usage data:** device type, operating system, app version, IP address, and basic logs of requests and errors, used to run and secure the Service.

**Information that stays on your device**
- **Location:** if you allow it, the app uses your location to show saved places near you and, if you turn on nearby nudges, to notify you when you're close to one. Your location is compared with your saved places on your device and is not sent to us.
- **App lock and notifications:** the Face ID (or other device unlock) setting, nudges, and the weekly digest run on your device. We don't receive your biometric data, and we don't send push notifications.

We do **not** sell your personal information, and we do not use it for third-party advertising.

## 2. How we use information

We use information to:
- provide the Service: retrieve post content, extract recommendations, look up place details, organize your lists, and let you share them;
- keep your account secure and prevent abuse, fraud, and misuse of the Service, including applying usage limits;
- troubleshoot, maintain, and improve the Service, including the accuracy of extraction (for example, by reviewing feedback and reports together with the post content and results they relate to);
- communicate with you about your account, support requests, and important changes;
- if you joined the launch waitlist, email you when StashtagAI is available on the App Store or Google Play (we do not use waitlist addresses for anything else, and we do not share them for marketing); and
- comply with legal obligations.

**Legal bases (EEA/UK users):** we process your information to perform our contract with you (providing the Service), for our legitimate interests (security, improving the Service), with your consent where required (including the launch waitlist, which you join by choice), and to comply with legal obligations.

## 3. AI processing

We use third-party AI providers to read and understand posts. We send them post content, never your email address or other account details:
- **Anthropic** extracts recommendations from the post's text and from linked websites, and may search the web to fill in details about an item, such as its name, location, and description.
- **OpenAI** transcribes the audio of an Instagram video when the caption doesn't name anything.
- **Google (Gemini)** reads the speech and on-screen text of that video if the transcript doesn't name anything either.

These providers process the content to return results to us. Under the business terms we use them on, they are not permitted to use it to train their models. We treat post content as untrusted input and check AI output against a fixed schema before saving it.

## 4. How we share information

We share information only as follows:
- **Service providers** that process data on our behalf under contracts that require them to protect it, including:
  - Supabase: database, authentication, file storage, and server functions;
  - Anthropic, OpenAI, and Google (Gemini): AI processing of post content (see Section 3);
  - Apify and TikTok's oEmbed service: retrieving public post content (they receive the post's link, not information about you);
  - Google Maps Platform: looking up places and their details (it receives the item's name and the city or address, not your location); and
  - Cloudflare and our other hosting and network providers, which deliver the Service and Website.
- **Services your device contacts directly:** when you view a map, your device loads map images from OpenStreetMap. When you open directions or an original post, Apple Maps, Google Maps, Instagram, or TikTok opens. The first time you transcribe a screen recording, your device downloads a speech-recognition model from Hugging Face. The app also checks Expo's servers for app updates. These services receive your IP address and basic device information when this happens, under their own privacy policies.
- **People you share lists with:** when you share a list, the people you add see the list and its items (names, descriptions, addresses, locations, tags, and links to the original posts), but not your notes, ratings, photos, or email address. They also see the name you set on your profile, so they know who shared it, and they can copy the list into their own account. When you add someone by email, the app tells you whether that address belongs to a StashtagAI account.
- **Legal and safety:** when required by law or legal process, or when needed to protect the rights, property, or safety of StashtagAI, our users, or others.
- **Business transfers:** in connection with a merger, acquisition, or sale of assets. In that case, this Policy will continue to apply to your information, or we will notify you of any changes.

## 5. Data retention

We keep your account information and content, including your feedback and reports, for as long as your account is active. When you delete a link, list, or your account, we delete the associated data as described in our [Data Deletion Policy](./data-deletion.md). Place details we look up are kept in a shared cache that contains no information about who asked for them. We keep launch waitlist entries until we have sent the launch email, and delete them within 90 days after that, or sooner if you ask us to remove you. Server logs are kept for a limited period (generally no more than 90 days) unless we need them longer for security or legal reasons. Backups are overwritten on a rolling schedule.

## 6. Security

We use reasonable technical and organizational measures to protect your information, including encryption in transit (HTTPS), access controls that separate each user's data, private storage for your photos, shared lists that open only for the people you add, and strict limits on which addresses our servers will fetch. No system is completely secure, and we cannot guarantee absolute security.

## 7. Your rights and choices

Depending on where you live, you may have the right to:
- **access** the personal information we hold about you and get a copy of it;
- **correct** inaccurate information;
- **delete** your information (see our [Data Deletion Policy](./data-deletion.md));
- **object to or restrict** certain processing;
- **data portability**; and
- **withdraw consent** where processing is based on consent.

**Choices in the app:** you can turn location access, nearby nudges, and notifications on or off in the app or in your device settings at any time. You can stop sharing a list, sign out of all your devices, and delete your account from your profile.

**Leaving the launch waitlist:** email [PRIVACY EMAIL] from the address you signed up with (or tell us that address) and ask to be removed. We delete it from the list within 30 days, and usually much sooner. Every waitlist email we send also explains how to be removed.

To use these rights, email [PRIVACY EMAIL]. We may need to verify your identity before acting on a request. We will respond within the time required by law (for example, 30 days under the GDPR and 45 days under California law). We will not discriminate against you for exercising your rights.

**California residents:** in the past 12 months, we have collected the categories of information described in Section 1 (identifiers, internet or network activity, and content you provide, including photos) for the purposes in Section 2. We do not sell or "share" personal information for cross-context behavioral advertising, as those terms are defined under the CCPA/CPRA.

**EEA/UK residents:** you also have the right to lodge a complaint with your local data protection authority.

## 8. International transfers

We and our service providers may process information in the United States and other countries. Where required, we rely on appropriate safeguards, such as Standard Contractual Clauses, for transfers of personal data out of the EEA or UK.

## 9. Children

The Service is not directed to children under 13 (or the minimum age required in your country), and we do not knowingly collect their personal information. If you believe a child has given us personal information, contact [PRIVACY EMAIL] and we will delete it.

## 10. Third-party content and links

The Service displays content from, and links to, third-party platforms and websites such as Instagram, TikTok, Google Maps, and Apple Maps. Their own privacy policies govern how they handle your information when you visit them.

## 11. Changes to this Policy

We may update this Policy from time to time. If we make material changes, we will notify you in the app or by email before they take effect. The "Last updated" date above shows when it was last revised.

## 12. Contact us

[COMPANY LEGAL NAME]
[MAILING ADDRESS]
Privacy questions and requests: [PRIVACY EMAIL]

See also: [Terms of Service](./terms-of-service.md) · [Data Deletion Policy](./data-deletion.md)
