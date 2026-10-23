# AdSense checklist for debtfreeempire.com (ads are OFF)

Status as of 2026-10-22: the site is prepared for an AdSense application. No Google ad or AdSense code is on any page, and nothing here turns ads on.

## Already done on the site
- Website privacy and cookie policy at /website-privacy (separate from the Empire Life Dashboard and Paper & Prosperity app policies). It says ads are not shown today and will be added after approval.
- "Blog" and "Website Privacy" links in the footer on every page; the blog is linked from /resources.
- Educational-purposes disclaimer at the end of every blog post.
- About (/about), contact (/support#message), privacy, sitemap and robots.txt (all crawlers allowed except /admin and /api/) are in place.
- Google Search Console is verified (bobbayd@gmail.com), sitemap submitted.

## Update 2026-10-22
- AdSense account exists (publisher ID ca-pub-3565608548741693). The old site ledger-and-life.vercel.app (flagged "low value content") was removed from the account at the owner's request; debtfreeempire.com was added ("Requires review").
- Added the verification meta tag `google-adsense-account` to every public page and /ads.txt. No AdSense script is on any page, so no ads can appear.
- Remaining: deploy, click Verify and then Request review in AdSense (owner clicks any terms or policy checkboxes).

## You do (Claude cannot create accounts or accept terms)
1. Sign up at https://adsense.google.com with the Google account that owns the site (bobbayd@gmail.com).
2. Enter the site as https://www.debtfreeempire.com, your country, and accept the terms.
3. Copy the publisher ID (looks like ca-pub-1234567890123456) and give it to Claude.
4. Fill in payment and tax details in AdSense when asked (never paste these anywhere except Google).

## Claude does once it has the publisher ID (still no ads)
- Add `<meta name="google-adsense-account" content="ca-pub-XXXXXXXXXXXXXXXX">` to the page head. This verifies the site without loading any Google script.
- Add /ads.txt with: `google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`
- Deploy, then click "Request review" in AdSense.

## After approval (go-live, in this order)
1. Update /website-privacy: say ads are shown, name Google AdSense, describe cookies/personalization and the opt-out links. Do this BEFORE turning ads on.
2. In AdSense > Privacy & messaging, create and publish the consent message for the EEA, UK and Switzerland.
3. Update the Content-Security-Policy in vercel.json using Google's published AdSense CSP guidance. Test in a browser and fix every console violation (same method used for Giscus).
4. Add the AdSense script and place ads on blog posts only. Rules: nothing above the first screen, nothing inside the product box, related-articles block or comments, no more than one ad per two sections, never on the printable, privacy, support or app pages.
5. Check mobile layout and page speed after turning ads on.
6. Keep "no ads" wording scoped to the apps ("no ads in our apps"); the website would now have them on the blog.

## Policy cautions
- Do not click your own ads or ask others to.
- Finance content is allowed but must be accurate and not promise results.
- Ads must not look like part of the content or sit next to buttons in a way that invites accidental clicks.
- Approval is Google's decision; low traffic does not by itself block it, but thin or duplicate content can.
