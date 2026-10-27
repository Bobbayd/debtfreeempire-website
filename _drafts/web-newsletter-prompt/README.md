# Web newsletter prompt (Paper & Prosperity web app)

A soft, dismissible card on the first dashboard visit in the **web** build only. It links to
https://www.debtfreeempire.com/#newsletter, so the app never collects or stores an email.

Add to the Flutter project:
1. Copy `web_newsletter_prompt.dart` to `lib/features/dashboard/`.
2. In `dashboard_screen.dart`: `import 'web_newsletter_prompt.dart';` and add `const WebNewsletterPrompt(),`
   right after `const MotivationalQuoteBanner(), const SizedBox(height: 16),` (phone layout).
3. In `wide_dashboard.dart` (a `part` of dashboard_screen.dart): add `const WebNewsletterPrompt(),` as the FIRST child
   of the Column inside the SingleChildScrollView (desktop browser layout).
4. Copy the test to `test/` and run: `flutter test --platform chrome test/web_newsletter_prompt_test.dart`
5. `flutter build web --release --base-href /` and deploy to the Vercel project `web` (app.paperandprosperity.shop).

Tested: the 2 widget tests pass in Chrome; analyzer is clean. Built from a clean copy of the 1.0.10 code with no couples work.
