---
tags: [business, seo, growth, research]
created: 2026-11-15
---
# SEO research (2026-11-15)

Desk research for [[F37 SEO and link previews]]. Competitor pages were fetched and read on 2026-11-15. Nothing was run against Lanyard itself.

## Summary
- **Real search volumes: not found.** No keyword tool was available. The signals below are Google autocomplete (UK settings, 2026-11-15) and what competitors put in titles. Treat them as relative hints only.
- **Competitors rank with** many comparison pages ("X vs Y", "alternatives"), use-case pages, templates and "how to" blog posts, not with the home page alone. Sizes seen in sitemaps: 139 to 437 URLs each (section 2).
- **Link previews need tags in the first HTML bytes.** Discord states that no script runs and later-added tags are never seen. WhatsApp wants the head within the first 300 KB. Lanyard's `index.html` has none of these tags today.
- **Recommended path:** put site-wide tags in `index.html`, and let the Worker rewrite title, description, canonical and Open Graph tags for each public route with `HTMLRewriter`, for everyone (no bot sniffing).
- **Biggest owner decision:** whether a person's card (`/c/<id>`) may be indexed or show a name and photo in a preview. Options in section 5.

## 1. Keywords and intent
Method: Google autocomplete (`suggestqueries.google.com`, `gl=gb`, `hl=en`), run 2026-11-15. Autocomplete shows what people type most, not how many. No suggestion means the phrase is rare, new or unused, not that nobody wants it. US place names in some results are left out.

| Phrase tried | What autocomplete showed (UK, 2026-11-15) | Reading |
| --- | --- | --- |
| digital business card | free, app, with qr code, iphone, apple wallet, design, canva | Broad head term; people want free and QR |
| digital business card uk | free, best, nfc, electronic business card uk, cost, "how can i make one for free" | UK intent exists: free, best-of lists, price |
| free digital business card | app, with qr code, maker, template, reddit, canva | Free and "maker" intent; Canva is a rival route |
| qr code business card | generator, app, on phone, design, examples | Tool and template intent |
| share contact qr code | android, iphone, whatsapp, "via qr code iphone" | People share contacts by QR from phone settings |
| business card without nfc | "nfc business card without subscription", "how do nfc business cards work" | Questions about NFC cost and how it works |
| event networking app | "best event networking app", one brand (Grip) | Comparison and "best" intent; brand-led |
| networking app for events | "best app for networking events", near me, tonight | Local and immediate intent |
| career fair networking | tips, events | Advice intent, not app intent |
| careers fair app | mostly US college-fair brands | Not a clear UK term |
| blinq alternative(s) | "free blinq alternative", "blinq me alternative" | Alternative-seeking pages are searched |
| hihello alternatives | "hihello alternatives free" | Same |
| popl alternatives | "popl alternatives" | Same |
| digital business card for students; nfc business card alternative; contact exchange qr; linkedin qr code alternative; society event check in app; student society networking event | no suggestions | Rare or unused phrases. Do not build pages around them yet |

What this suggests for Lanyard (hints, not data):
- Students and society committees do not appear to search for "event networking app" by that name. They likely find tools by word of mouth, search "free digital business card", or search "how to" questions. The event-organiser side may search "event check in app" and "networking event ideas": not tested for volume.
- "Free", "app", "QR code" and "uk" are the modifiers that recur. "NFC" appears with "without subscription", which fits Lanyard's no-hardware, no-app stance.
- Alternative pages ("blinq alternative") are searched. Competitor pages already target them (section 2).

## 2. What competitors put in their tags and what they rank with
Home pages fetched 2026-11-15. "Title" is the `<title>`; "OG image" size is as declared in tags.

| Site | Title (home) | Description (start) | OG and card | JSON-LD types seen |
| --- | --- | --- | --- | --- |
| [Blinq](https://blinq.me/) | "Blinq / The AI contacts platform for the real world" | "Blinq, for people who meet people. Share who you are, remember who you meet..." | og title, description, image, url; `summary_large_image`; canonical | WebPage, SoftwareApplication, AggregateRating, Offer, FAQPage |
| [Popl](https://www.popl.co/) | "Popl / Your AI GTM Platform for Event Lead Capture" | "Capture leads, scan badges, enrich data, and sync it all to your CRM..." | og size 3600x1890; `twitter:card` is `summary`; og:site_name; canonical | Organization, FAQPage |
| [HiHello](https://www.hihello.com/) | "The Professional Presence and Lead Capture Platform" | "HiHello gives your company an on-brand professional presence..." | `summary_large_image`; canonical | SoftwareApplication, AggregateOffer, Organization |
| [V1CE](https://v1ce.co/) | "V1CE / The Business Card With Lead Capture Built In" | "Paper cards get binned and contacts go cold..." | og 1200x630, alt text, `en_GB`, `summary_large_image`; og title differs from `<title>` | Organization, WebSite, FAQPage |
| [Brella](https://www.brella.io/) | "Brella / Event platform / Event app / Matchmaking & Networking" | "Transform your events with Brella's customizable all-in-one event app..." | `twitter:card` is `summary`; canonical | WebPage |
| [Swapcard](https://www.swapcard.com/) | "Event Management Platform With Top-Rated Support / Swapcard" | "Run registration, the event app, exhibitor tools, and AI matchmaking..." | `summary_large_image`; canonical | WebPage, FAQPage |
| [Linq](https://linqapp.com/) | "Communication APIs for Messaging and Voice / Linq" | "Reliably deliver messages globally with our iMessage API..." | og 1200x630; `summary_large_image` | Organization |

- **Linq:** its home page (linqapp.com) now sells messaging APIs, not cards. Its card product still appears in a rival's comparison page (a card at $14.99 plus a $29 monthly plan, per [V1CE](https://v1ce.co/compare/linq-vs-v1ce-digital-business-card), a rival, 2026-11-15). Treat Linq as a card competitor only through that page.
- **Patterns:** short brand-first titles; descriptions that open with the promise and the pain; `summary_large_image` on most; canonical on all; FAQ markup on most. Two use the small `summary` card.
- **Page types (sitemap path counts, 2026-11-15):**
  - Blinq, 194 URLs: 125 blog, 11 solutions (for example widget, Apple Watch, free email-signature generator), 4 comparison pages, 5 case studies.
  - HiHello, 437 URLs: 324 blog, 16 features, 5 solutions, 3 "for" industry pages, 2 "vs" pages, 5 customer stories.
  - V1CE, 139 URLs: 38 blog, 29 case studies, 17 feature, 15 compare, plus a "digital-business-card" landing page and a reviews page.
  - Brella, 235 URLs: 64 blog, 58 roadmap, 40 success stories.
  - Swapcard, 430 URLs: 157 blog, 69 resources, 37 customers, 32 features, 25 compare, 17 solutions.
  - Popl: sitemap is an index of pages, blogs and articles; counts not taken.
- **Comparison pages are the common thread.** Examples: "Blinq vs Popl | What's the Difference?", "10 Best Blinq Alternatives 2026 | No Surprise Charges", "Popl vs V1CE (2026): Features, Prices and What's Free", "HiHello vs Blinq". Free tools also appear (Blinq's email-signature generator). Rival comparison pages are marketing, so claims on them are not facts.

## 3. Link previews: what each app reads
Rules shared by all: tags must be in the server HTML (not added by the Vue app), the image URL must be absolute and public, and the page must answer without a login or a redirect to sign-in.

| App | User agent | Tags read | Image rules | Runs JavaScript | Cache |
| --- | --- | --- | --- | --- | --- |
| WhatsApp | `WhatsApp/2.x.x.x` followed by A, I or N (Android, iOS, web), per [WhatsApp docs](https://developers.facebook.com/documentation/business-messaging/whatsapp/link-previews/) | `og:title`, `og:description`, `og:url`, inside `<head>`, not empty; head within first 300 KB; title shows 2 lines, description 1 or 2 lines (80 characters is enough) | Under 600 KB, 300 px or wider, aspect ratio 4:1 or less. Many developers report 300 KB as the safe size, which is not official | Not stated. Treat as no | Not stated |
| iMessage | Not documented by Apple. Third parties report a Safari-like string with facebookexternalhit, Facebot and Twitterbot tokens, fetched from the sender's device (unverified) | Open Graph ([Apple TN2444](https://developer.apple.com/library/archive/technotes/tn2444/_index.html)). A developer-forum post says title, image and site name show; description may not | Not specified. Signed or short-lived image URLs have failed in reports | Not stated | Old previews stick in reports |
| LinkedIn | `LinkedInBot/1.0` (third-party sources) | `og:title`, `og:image`, `og:description`, `og:url` (the tool is [Post Inspector](https://www.linkedin.com/post-inspector/)) | 1200x627 for the large card; 5 MB limit; smaller images become a thumbnail (third-party sources, not LinkedIn docs) | Not stated | About 7 days; Post Inspector refreshes (third-party) |
| Slack | `Slackbot-LinkExpanding 1.0`, `Slack-ImgProxy 0.19`, `Slackbot 1.0` ([Slack robots page](https://api.slack.com/robots)) | oEmbed, Twitter Card and Open Graph. Fetches as little as it can using HTTP Range requests, so tags must come early in the page | Image is fetched and checked | Not stated | About 30 minutes, globally |
| X | `Twitterbot` | `twitter:card` set to `summary_large_image`, then title, description, image; falls back to Open Graph (believed; not re-read today) | Under 5 MB; JPG, PNG, WEBP, GIF; SVG not supported ([legacy card page](https://dev.twitter.com/cards/types/summary-large-image) via search). About 2:1; 300x157 minimum (third-party) | Not stated | Not stated |
| Discord | `Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)` (via search, quoting Discord) | `og:title` or `twitter:title` or `<title>`; `og:description`; `og:site_name`; images; `og:type`; `twitter:card`; `theme-color` ([Discord docs](https://docs.discord.com/developers/link-previews/overview)) | PNG, GIF, JPG, WEBP, AVIF. Declare `og:image:width` and `og:image:height` or it measures the file | **No.** One GET; "tags added by a client-side script after load are never seen" | About 30 minutes |
| Facebook | `facebookexternalhit/1.1` ([crawler list](https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/)); `meta-externalagent/1.1` is a separate AI-training crawler | `og:url`, `og:title`, `og:description`, `og:image`, `fb:app_id`; `og:type` defaults to website ([webmasters](https://developers.facebook.com/docs/sharing/webmasters/)) | Set width and height; images cached by URL until the URL changes. Size advice: not on that page | Not stated | Re-scrape in Sharing Debugger |
| Telegram | `TelegramBot (like TwitterBot)` (a bug report, not docs) | Open Graph; Instant View is separate | Telegram does not publish limits (a bug report says so). Third parties suggest 1200x630 and under 300 KB, unofficial | Third parties say no | Changing the image URL is the usual fix |

- **Size and format to use:** one image at **1200x630**, PNG or JPEG (not SVG; X says it is unsupported), well under 300 KB so every row passes, with `og:image:width`, `og:image:height` and `og:image:alt`.
- **Tags to send everywhere:** `og:type`, `og:site_name`, `og:title`, `og:description`, `og:url`, `og:image` (+ width, height, alt), `og:locale` (`en_GB`), `twitter:card` = `summary_large_image`, plus `twitter:title`, `twitter:description`, `twitter:image` for safety.
- **Put them first in `<head>`** (after charset), because Slack reads ranges and WhatsApp reads only the first 300 KB.
- **Facebook's page** says its crawler "may bypass robots.txt for security or integrity checks". Do not rely on `robots.txt` to stop previews; rely on what the page returns.

## 4. Serving per-page tags from the Worker
- **Today:** `index.html` has one title, one description, no Open Graph, no canonical. Every route returns the same shell, so a bot sees the same preview for every link.
- **Approach:** in the Worker, for the public routes only, fetch `index.html` from the static assets and pass it through one `HTMLRewriter` that sets the title, description, canonical and Open Graph tags for that route. Cloudflare says `HTMLRewriter` is a streaming parser, handlers may be async, strings are escaped unless `{ html: true }` is passed, and an exception mid-stream truncates the page ([docs](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/)). So: escape user text by default, never use `html: true` on names, and keep handlers non-throwing.
- **Do it for everyone, not just bots.** The same HTML goes to people and bots, with no user-agent list to maintain and no cache split. The Vue app then also sets `document.title` on route change.
- **Speed:** static routes (`/`, `/hosts`, `/terms`, `/privacy`) need no database call, only a table of strings in the Worker. `/e/<code>` needs one D1 lookup for the event name; cache it briefly and fall back to the generic tags if it is slow or missing. Card pages need a lookup only if the owner allows a name in the preview.
- **Make the tags exist in `index.html` too**, so a failure of the rewrite still gives the site-wide preview.
- **`robots.txt` and `noindex`:** Google says a page blocked in `robots.txt` cannot show its `noindex`, and may still be listed ([Google](https://developers.google.com/search/docs/crawling-indexing/block-indexing)). Therefore: use `Disallow` for private areas nobody links to, but for `/c/` and `/e/` leave them crawlable and send `noindex` (meta tag, or an `X-Robots-Tag` header, which is simpler from a Worker). Note F37 step 4 lists only private paths in `Disallow`, which is consistent.
- **`canonical` and `og:url`:** one clean URL per page, no query string. For `/e/<code>` use the code URL. Do not set a canonical in static `index.html` for every route; the rewrite sets it, with `/` as the fallback.
- **Structured data (JSON-LD), what is worth adding:**
  - `Organization` and `WebSite` on `/`: name, URL, logo. Add `sameAs` only for real profiles.
  - `SoftwareApplication`: Google's rich result needs a rating or review ([Google](https://developers.google.com/search/docs/appearance/structured-data/software-app)). Lanyard has none, and one must never be invented. Skip, or add without a rating for context only.
  - `Event`: Google needs a name, start date and physical place, and says events must be bookable by the general public; membership or invitation events are ineligible ([Google](https://developers.google.com/search/docs/appearance/structured-data/event)). Most host events are not. Do not add it unless a host marks an event public.
  - `FAQPage` markup is used by most competitors; no check was made of Google's current use of it.
- **`sitemap.xml`:** marketing pages only; no `/c/`, `/e/` or private routes.

## 5. Privacy: should a person's card page be indexed or show a name and photo?
Neutral options, for the owner. This is not legal advice; a lawyer or the ICO's guidance should confirm.

| Option | What it means | For | Against |
| --- | --- | --- | --- |
| A. Closed (F37 default) | `noindex`; preview says only "A Lanyard card" and the Lanyard image | Lowest risk; no name or photo leaves the person's own sharing | Weaker previews when people share their link in chats; less viral pull |
| B. Name only in preview | Preview shows the person's name; `noindex` | Friendlier link in a group chat | Name goes to every chat platform, which cache it; harder to withdraw |
| C. Opt-in per card | Default A; a person switches on "show name and photo in previews" and, separately, "let search engines find me" | Puts the choice with the person; matches the consent-first stance of [[D001 Hosts pay, attendees free]] | More settings, copy and tests; some will not understand it |
| D. Open | Name, photo, index allowed | Best reach for people who want to be found | Highest exposure and scraping; hardest to undo |

Points to weigh:
- **A name and a photo are personal data.** Putting them in HTML that robots fetch is a publication to the world, not only to the person who got the link. The legal basis, and the notice to the person, need to cover that.
- **Expectation.** People who make a card to hand to someone at an event may not expect to be found by search or to appear in a chat preview beyond that person.
- **Caching.** Platforms keep previews and images (Facebook caches images by URL; Slack and Discord about 30 minutes; LinkedIn about 7 days per third parties). A later change or deletion does not reach copies already made.
- **Delisting is hard.** The ICO says it may ask a search engine to remove a result in some cases but will not do so just because someone objects ([ICO](https://ico.org.uk/for-the-public/online/internet-search-results)). Not indexing in the first place is easier than removing later.
- **Scraping.** Indexable pages with names and photos are easy to harvest. If card ids (`/c/<id>`) are guessable, a crawler could enumerate them; check that ids are random.
- **`noindex` is a request.** Compliant engines honour it; other crawlers may not. Anything truly private needs a sign-in.
- **Age.** Some users may be under 18; check the age rules in the privacy policy before any public preview.
- **Events (`/e/<code>`):** an event name and host are usually meant to be public to invitees but may be internal. A host-controlled "public event page" switch is a variation of option C.

## 6. Concrete changes for Lanyard, in order
1. **Preview image.** Make `public/og/lanyard-1200x630.png` (PNG, under 300 KB, readable at small size). Needs the owner or a designer.
2. **Site-wide tags in `index.html`** (below), placed straight after `<meta charset>`.
3. **Worker `HTMLRewriter`** for the public routes with the per-page table below; generic fallback if a lookup fails.
4. **`noindex` and `Disallow`:** `X-Robots-Tag: noindex` on `/app`, `/admin`, `/signin`, `/claim`, `/redeem`, `/privacy-request`, `/c/<id>` and (until decided) `/e/<code>`; `robots.txt` and `sitemap.xml` below.
5. **Vue sets `document.title`** per route for people.
6. **JSON-LD** `Organization` and `WebSite` on `/` only.
7. **Verify** with each app's own checker (Facebook Sharing Debugger, LinkedIn Post Inspector, Discord paste) and a local run with the bots' user agents, per F37's acceptance checks. Search Console set-up is an owner step.

**Site-wide tags (suggested text):**
```
<title>Lanyard: a digital card and a memory of everyone you meet</title>
<meta name="description" content="Show a digital card, scan to connect, and remember who you met and why. Free for attendees, no app to install. Made in the UK for events." />
<link rel="canonical" href="https://lanyd.fyi/" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Lanyard" />
<meta property="og:title" content="Lanyard: a digital card and a memory of everyone you meet" />
<meta property="og:description" content="Show a digital card, scan to connect, and remember who you met and why. Free for attendees, no app to install." />
<meta property="og:url" content="https://lanyd.fyi/" />
<meta property="og:image" content="https://lanyd.fyi/og/lanyard-1200x630.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Lanyard: show a card, scan to connect, remember who you met" />
<meta property="og:locale" content="en_GB" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Lanyard: a digital card and a memory of everyone you meet" />
<meta name="twitter:description" content="Show a digital card, scan to connect, and remember who you met and why. Free for attendees, no app to install." />
<meta name="twitter:image" content="https://lanyd.fyi/og/lanyard-1200x630.png" />
```
Keep the existing `theme-color`, icons and manifest tags. Title is 57 characters; descriptions are written to fit common display limits (these limits are display habits, not rules).

**Per-page titles and descriptions (suggested):**
| Route | Title | Description | Index? |
| --- | --- | --- | --- |
| `/` | as above | as above | Yes |
| `/hosts` | Event check-in and networking for hosts / Lanyard | Run a society night or careers fair with check-in, who-to-meet prompts and a feedback survey. Free for societies up to 200 check-ins; credit packs for everyone else. | Yes |
| `/terms` | Terms of service / Lanyard | The terms for using Lanyard. | Yes |
| `/privacy` | Privacy policy / Lanyard | How Lanyard collects, uses and protects your data. | Yes |
| `/privacy-request` | Privacy request / Lanyard | Ask to see, fix or delete your data. | No (`noindex`; not in sitemap) |
| `/e/<code>` | `<Event name>` on Lanyard | Join `<Event name>` on Lanyard: check in, show your card and meet people. (Use only the event name; add the host name if the host agrees.) | No until decided; preview image is the generic one |
| `/c/<id>` | A Lanyard card | Open this card to connect on Lanyard. (Option A.) | No until decided |

**`robots.txt`:**
```
User-agent: *
Allow: /
Disallow: /app
Disallow: /admin
Disallow: /api/
Disallow: /signin
Disallow: /claim
Disallow: /redeem

Sitemap: https://lanyd.fyi/sitemap.xml
```
`/c/` and `/e/` are left crawlable on purpose so `noindex` can be read. The host site (own address) needs its own `robots.txt` or headers.

**`sitemap.xml`:** four URLs only:
```
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://lanyd.fyi/</loc></url>
  <url><loc>https://lanyd.fyi/hosts</loc></url>
  <url><loc>https://lanyd.fyi/terms</loc></url>
  <url><loc>https://lanyd.fyi/privacy</loc></url>
</urlset>
```

**Three content pages worth writing later** (static HTML, to respect [[F28 Public-page JS budget]]):
1. "A digital business card without NFC or an app": targets the "free", "uk", "no subscription" and "without NFC" signals in section 1.
2. "Running a careers fair or society night: check-in, who-to-meet and follow-up": for organisers; a how-to page with a free checklist.
3. "Alternatives to Blinq, HiHello and Popl for students and events": a fair comparison, since all three rivals publish such pages and "alternative" phrases autocomplete. Recheck every competitor claim on the day of writing; do not copy their marketing.

## Owner decisions needed
- Card pages: option A, B, C or D (section 5). Event pages: indexed or not.
- Who makes the 1200x630 image, and whether the address in tags is `lanyd.fyi`.
- Whether to write the three content pages, and who reviews comparison claims.

## Not found or unverified
- Search volumes for every phrase. Hosts' search terms (event check-in, careers fair tools) were not tested beyond the table.
- Apple's own user agent and preview field list; WhatsApp and Telegram JavaScript behaviour; LinkedIn and Telegram official image rules; X's current card page (docs.x.com page returned 404, developer.x.com returned 402). Where sources are third-party they are marked.
- Facebook's current image-size advice (the page read did not give it).

## Sources
All read 2026-11-15 unless marked "via search" (summary seen, page not opened).
- Competitor home and sitemap pages: [blinq.me](https://blinq.me/), [popl.co](https://www.popl.co/), [hihello.com](https://www.hihello.com/), [linqapp.com](https://linqapp.com/), [v1ce.co](https://v1ce.co/), [brella.io](https://www.brella.io/), [swapcard.com](https://www.swapcard.com/), and their `sitemap.xml` files.
- Previews: [WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/link-previews/), [Facebook webmasters](https://developers.facebook.com/docs/sharing/webmasters/), [Facebook crawlers](https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/), [Slack](https://api.slack.com/robots), [Discord](https://docs.discord.com/developers/link-previews/overview), [Apple TN2444 (via search)](https://developer.apple.com/library/archive/technotes/tn2444/_index.html), [X card (via search)](https://dev.twitter.com/cards/types/summary-large-image), LinkedIn and Telegram from third-party articles (via search).
- Technical: [Cloudflare HTMLRewriter](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/), [Google noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing), [Google SoftwareApplication](https://developers.google.com/search/docs/appearance/structured-data/software-app), [Google Event](https://developers.google.com/search/docs/appearance/structured-data/event), [ICO on search results (via search)](https://ico.org.uk/for-the-public/online/internet-search-results).

Related: [[Competitors]], [[Blinq research 2026-11-14]], [[Go-to-Market]], [[Screens and Routes]] · back to [[00 Home]]
