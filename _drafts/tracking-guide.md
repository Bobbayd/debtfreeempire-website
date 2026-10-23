# What the website tracks (HeyCatch events)

Every event also carries `page` (the path), `device` (mobile / tablet / desktop) and `os`
(ios / android / windows / mac / chromeos / linux / other). No query strings, names, emails,
or anything typed into forms or the Empire AI chat is ever recorded.

## Download funnel (conversions)
| Event | Fires when | Extra fields |
|---|---|---|
| `eld_store_click` | Empire Life Dashboard: Mac App Store or Microsoft Store link clicked (the HeyCatch goal) | `store`, `placement` |
| `pp_store_click` | Paper & Prosperity: App Store or Google Play badge clicked (NEW) | `store`, `placement` |
| `pp_cta_click` | Any link to the Paper & Prosperity page or web app | `destination`, `placement` |
| `article_cta_click` | Any link to the Empire Life Dashboard page or its stores | `destination` |
| `waitlist_signup` | Notify Me form submitted successfully | |
| `outbound_click` | Any link that leaves the site (Etsy, social, stores) (NEW) | `destination` (host + path), `placement` |

## Behaviour on the app pages (/apps/empire-life-dashboard, /paper-and-prosperity, /apps, /pricing) (NEW)
| Event | Meaning |
|---|---|
| `app_page_view` | Landed on an app page. `referrer_type` = direct / search / social / internal / other:host, `from_path` for internal. Empire Life Dashboard also has `can_install` (true only on Windows or Mac). |
| `app_scroll_depth` | Reached 25 / 50 / 75 / 100% of the page (`app`, `depth`) |
| `app_engaged` | Still on the page, tab visible, after 15 or 60 seconds |
| `app_faq_open` | Opened an FAQ item (`question` = the page's own question text) |
| `app_video_play` / `app_video_complete` | Started / finished the walkthrough video |

## Empire AI (NEW, counts only)
`empire_ai_open`, `empire_ai_ask`, `empire_ai_team_message` (`with_email` true/false).

## Questions to answer in HeyCatch
1. **Right device?** `app_page_view` for Empire Life Dashboard split by `can_install`. A high share of `false` means most visitors are on phones and cannot install a Windows/Mac app yet. The fix is the iPhone waitlist, not more persuasion.
2. **Do they look, then leave?** Compare `app_page_view` to `app_scroll_depth` 50/75 and `app_engaged` 15s. Low scroll = the top of the page does not hold them.
3. **Do they reach the buttons but not click?** `app_scroll_depth` 75+ versus `eld_store_click` / `pp_store_click`.
4. **Which badge?** `pp_store_click` by `store` and `os` (iPhone visitors should pick App Store; Android, Google Play).
5. **What do they wonder about?** `app_faq_open` by `question`.
6. **Where do they come from?** `referrer_type` and `from_path`: do blog readers (internal) convert better than search or direct?
7. **A click is not an install.** Store clicks show interest; installs live in App Store Connect, Google Play Console and the Microsoft Partner Center. Compare their daily installs with the store-click counts.

Testing without polluting real data: in the browser console run `localStorage.setItem('dfe_track_test','1')`
and reload. Events are then collected in `window.__dfeEvents` instead of being sent.
