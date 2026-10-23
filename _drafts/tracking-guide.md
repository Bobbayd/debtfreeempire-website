# What the website tracks (HeyCatch events + one survey question)

Deliberately small. Only what helps answer: why do people visit the app pages but not download?
Every event also carries `page` (the path), `device` (mobile / tablet / desktop) and `os`
(ios / android / windows / mac / chromeos / linux / other). No query strings, names, emails,
or anything typed into forms, the survey or the Empire AI chat is ever recorded in analytics.

## Download funnel
| Event | Fires when | Extra fields |
|---|---|---|
| `eld_store_click` | Empire Life Dashboard: Mac App Store or Microsoft Store link clicked (the HeyCatch goal) | `store`, `placement` |
| `pp_store_click` | Paper & Prosperity: App Store or Google Play badge clicked | `store`, `placement` |
| `pp_cta_click` | Any link to the Paper & Prosperity page or web app | `destination`, `placement` |
| `article_cta_click` | Any link to the Empire Life Dashboard page or its stores | `destination` |
| `waitlist_signup` | Notify Me form submitted successfully | |

## Behaviour on the two app pages only (/apps/empire-life-dashboard, /paper-and-prosperity)
| Event | Meaning |
|---|---|
| `app_page_view` | Landed on an app page. `referrer_type` = direct / search / social / internal / other:host, `from_path` for internal. Empire Life Dashboard also has `can_install` (true only on Windows or Mac). |
| `app_scroll_depth` | Reached 50% or 100% of the page (`app`, `depth`) |

## Visitor survey (stored in our own database, not HeyCatch)
One optional question on the two app pages, about 20 seconds after arriving: "What are you hoping to get help with?"
Options: paying off debt, a budget I'll stick to, saving for a goal, organizing my whole life, just looking, something else (optional short note).
Not shown to anyone who already clicked a download link or answered/dismissed it before. Stored with app, device, OS, referrer type and
whether the visitor can install, with no name, email or IP, and deleted after 90 days.
Results: admin > Survey (overall, per page, per device, plus Empire Life Dashboard visitors who cannot install).

## Empire AI
Chats are saved 30 days for the owner (admin > Chats); not part of analytics.

## Questions to answer
1. **Right device?** `app_page_view` for Empire Life Dashboard split by `can_install`. A high share of `false` means most visitors are on phones and cannot install a Windows/Mac app yet. The fix is a phone version or waitlist, not more persuasion.
2. **Do they look, then leave?** `app_page_view` versus `app_scroll_depth` 50 and 100.
3. **Do they reach the buttons but not click?** `app_scroll_depth` 100 versus `eld_store_click` / `pp_store_click`.
4. **Which badge?** `pp_store_click` by `store` and `os` (iPhone visitors should pick App Store; Android, Google Play).
5. **What do they want?** admin > Survey. If most say "paying off debt" or "budget", lead the page with that.
6. **Where do they come from?** `referrer_type` and `from_path`: do blog readers (internal) convert better than search or direct?
7. **A click is not an install.** Store clicks show interest; installs live in App Store Connect, Google Play Console and the Microsoft Partner Center.

Testing without polluting real data: in the browser console run `localStorage.setItem('dfe_track_test','1')`
and reload. Events are then collected in `window.__dfeEvents` instead of being sent.
For the survey, `localStorage.setItem('dfe_survey_delay_ms','1500')` shortens the delay.
