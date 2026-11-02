import type { Source } from "./types.ts";
import { publicBoards, boardSourceDefaults } from "./boards/catalog.ts";
// Public feeds use the same bounded reader and matching pipeline as API sources.
export const rssSources = ([
  ["WordPress Jobs", "https://jobs.wordpress.net/feed/", 24],
  ["RemoteJobs.com", "https://www.remotejobs.com/jobs.rss", 24],
  ["VueJobs", "https://app.vuejobs.com/feed/posts", 12],
  ["We Work Remotely · Programming", "https://weworkremotely.com/categories/remote-programming-jobs.rss", 6],
  ["We Work Remotely · Design", "https://weworkremotely.com/categories/remote-design-jobs.rss", 6],
  ["We Work Remotely · Product", "https://weworkremotely.com/categories/remote-product-jobs.rss", 6],
  ["GolangProjects", "https://www.golangprojects.com/rss.xml", 24],
  ["LaraJobs", "https://larajobs.com/feed", 24],
  ["ClojureJobboard", "https://clojurejobboard.com/rss.xml", 24],
  ["NoDesk · Engineering", "https://nodesk.co/remote-jobs/engineering/index.xml", 6],
  ["Real Work From Anywhere", "https://www.realworkfromanywhere.com/rss.xml", 12],
  ["Dev Remotely", "https://devremotely.com/feed/jobs.xml", 6],
  ["Startup Jobs · Remote", "https://startup.jobs/feeds/jobs?workplace=remote", 6],
  ["Python Job Board", "https://www.python.org/jobs/feed/rss/", 24],
  ["Rails Job Board", "https://jobs.rubyonrails.org/jobs.rss", 24],
  ["Elixir Jobs", "https://elixirjobs.net/rss", 24],
  ["FOSS Jobs", "https://www.fossjobs.net/rss/all/", 24],
  ["Berlin Startup Jobs · Engineering", "https://berlinstartupjobs.com/engineering/feed/", 24],
  ["Hasjob", "https://hasjob.co/feed", 12],
  ["Remote First Jobs", "https://remotefirstjobs.com/rss/jobs/software-development.rss", 6],
  ["MoAIJobs", "https://www.moaijobs.com/ai-jobs.rss", 24],
  ["We Work Remotely · DevOps", "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss", 6],
] as const).map(([name, identifier, intervalHours]) => ({
  name, identifier, intervalHours,
  type: "rss" as const, enabled: true, requestLimit: 1,
}));
export const discoverySources: Pick<
  Source,
  "name" | "type" | "identifier" | "enabled" | "requestLimit" | "intervalHours"
>[] = [
  ...Object.keys(publicBoards).map(boardSourceDefaults),
  ...rssSources,
  {
    name: "Working Nomads",
    type: "workingnomads",
    identifier: "workingnomads",
    requestLimit: 1,
    intervalHours: 24,
  },
  {
    name: "Himalayas",
    type: "himalayas",
    identifier: "profile",
    requestLimit: 20,
    intervalHours: 24,
  },
  {
    name: "Remote OK",
    type: "remoteok",
    identifier: "remoteok",
    requestLimit: 1,
    intervalHours: 6,
  },
  {
    name: "Remotive",
    type: "remotive",
    identifier: "remotive",
    requestLimit: 1,
    intervalHours: 12,
  },
  {
    name: "4 Day Week",
    type: "fourdayweek",
    identifier: "engineering,product,design,data",
    requestLimit: 4,
    intervalHours: 12,
  },
  {
    name: "Arbeitnow · Germany · Visa sponsorship",
    type: "arbeitnow",
    identifier: "de",
    requestLimit: 3,
    intervalHours: 12,
  },
  {
    name: "Arbeitnow · UK · Visa sponsorship",
    type: "arbeitnow",
    identifier: "uk",
    requestLimit: 3,
    intervalHours: 12,
  },
  {
    name: "Jobicy",
    type: "jobicy",
    identifier: "jobicy",
    requestLimit: 1,
    intervalHours: 6,
  },
].map(s=>({...s,type:s.type as Source['type'],enabled:s.type!=="public_board"}));
