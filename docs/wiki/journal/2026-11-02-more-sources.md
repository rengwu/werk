---
title: More job sources
section: Journal
updated: 2026-11-02
---
# More job sources

The user asked to find more job boards. Twelve new boards and one additional We Work Remotely category were checked and added. The catalog now has 50 entries: 30 enabled API/feed sources and 20 optional scraped boards. Existing installations gain missing entries on startup while preserving their previous source choices, custom boards, IDs and cooldowns. See [discovery behavior](../features/discovery.md) and [verification](../verification/runs/2026-11-02-source-expansion.md).

## Added feeds

The entries below each returned a populated public RSS/Atom feed through werk's actual HTTP reader on 2 November 2026. One request per feed returned 795 entries in total; entries can overlap and are not a count of unique vacancies or matches for the user. Matching was exercised with fictional candidate facts. None require a new account or API key for these feed reads.

| Board / feed | Additional coverage | Observed entries | Content / limit |
| --- | --- | ---: | --- |
| [NoDesk · Engineering](https://nodesk.co/remote-jobs/engineering/) · [feed](https://nodesk.co/remote-jobs/engineering/index.xml) | Remote engineering | 10 | Recent excerpts; employer from the title; missing hiring locations stay unknown |
| [Real Work From Anywhere](https://www.realworkfromanywhere.com/rss-feeds) · [feed](https://www.realworkfromanywhere.com/rss.xml) | Remote engineering, product and design | 118 | Full descriptions; the board name does not establish worldwide eligibility |
| [Dev Remotely](https://devremotely.com/feeds) · [feed](https://devremotely.com/feed/jobs.xml) | Remote software, data and infrastructure | 50 | Excerpts with employer, listed location and salary where present |
| [Startup Jobs](https://startup.jobs/api/) · [remote feed](https://startup.jobs/feeds/jobs?workplace=remote) | Remote startup roles | 50 | Summaries; preserve listed country restrictions; the engineering filter returned mixed roles during research |
| [Python Job Board](https://www.python.org/jobs/) · [feed](https://www.python.org/jobs/feed/rss/) | Python, backend, data and ML | 20 | Full descriptions; location prefix; ambiguous comma-separated employer/title stays intact with employer unknown |
| [Rails Job Board](https://jobs.rubyonrails.org/) · [feed](https://jobs.rubyonrails.org/jobs.rss) | Ruby/Rails and platform engineering | 11 | Full descriptions; employer explicitly included in title |
| [Elixir Jobs](https://elixirjobs.net/) · [feed](https://elixirjobs.net/rss) | Elixir/Phoenix | 10 | Job place/type/location are preserved; descriptions remain excerpts and employer can be unknown |
| [FOSS Jobs](https://www.fossjobs.net/rss/) · [feed](https://www.fossjobs.net/rss/all/) | Paid open-source work | 10 | Full descriptions; employment type, employer and location extracted from explicit fields |
| [Berlin Startup Jobs · Engineering](https://berlinstartupjobs.com/engineering/) · [feed](https://berlinstartupjobs.com/engineering/feed/) | Berlin startup engineering | 12 | Excerpts; employer comes from the title, not the posting account; no inferred Berlin location |
| [Hasjob](https://hasjob.co/) · [feed](https://hasjob.co/feed) | India/South Asia and remote technology roles | 18 | Atom content; explicit location and matching employer header; unknown fields retained |
| [Remote First Jobs](https://remotefirstjobs.com/rss) · [software feed](https://remotefirstjobs.com/rss/jobs/software-development.rss) | Remote software roles | 100 | Full descriptions; category tags can be broad; explicit hybrid/on-site statements are retained |
| [MoAIJobs](https://www.moaijobs.com/) · [feed](https://www.moaijobs.com/ai-jobs.rss) | AI, ML, data and robotics | 353 | Full descriptions after unwrapping literal nested CDATA; explicit company/location fields |
| [We Work Remotely · DevOps](https://weworkremotely.com/remote-job-rss-feed) · [feed](https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss) | DevOps and systems administration | 33 | Full descriptions and hiring-region metadata; extends the existing WWR coverage |

Every feed keeps links to its original listings and source attribution. Scans remain manual by default; source cooldowns range from 6 to 24 hours and each feed gets one request per scan. Excerpts cannot replace a previously saved full description. Unknown work location, employer or authorization is not invented to make a listing match.

## Candidates not added

| Candidate | Observation / reason |
| --- | --- |
| [Ruby on Remote](https://rubyonremote.com/) | Direct public-page read returned HTTP 403; no connector added from unverified feed guesses |
| [RustJobs.dev](https://rustjobs.dev/) | Direct read returned HTTP 429; no repeated probing or rate-limit bypass |
| [DjangoJobs](https://djangojobs.net/) | Public homepage says the site is under construction |
| [SwissDevJobs RSS](https://swissdevjobs.ch/rss) | Direct endpoint returned HTML rather than a populated RSS feed |
| [GermanTechJobs](https://germantechjobs.de/) | Homepage redirects to a JobCopilot signup flow |
| [MyCareersFuture](https://www.tech.gov.sg/products-and-services/for-citizens/employment/mycareersfuture/) | Useful Singapore coverage to investigate separately; no documented public integration was verified in this pass |

The Muse, Reddit, Hacker News and X remain outside the accepted source scope. Employer-specific Greenhouse, Ashby and Lever boards remain user-added sources.
