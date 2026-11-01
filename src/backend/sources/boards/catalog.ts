export type PublicBoard = {
  name: string;
  seeds: string[];
  jobPath: string;
  hosts?: string[];
  paging?: string;
  legacy?: string;
};
// Public reading routes only. Account/application routes are never discovery seeds.
export const publicBoards: Record<string, PublicBoard> = {
  dynamite: {
    name: "Dynamite Jobs",
    seeds: ["https://dynamitejobs.com/category/remote-development-jobs"],
    jobPath: "^/company/[^/]+/remote-job/[^/]+$",
  },
  hiredly: {
    name: "Hiredly",
    seeds: [
      "https://my.hiredly.com/Full-Stack-Software-Engineer-jobs",
      "https://my.hiredly.com/Frontend-Developer-jobs",
      "https://my.hiredly.com/AI-Engineer-jobs",
      "https://my.hiredly.com/Mobile-Developer-jobs",
    ],
    jobPath: "^/jobs/[^/]+$",
  },
  linkedin: {
    name: "LinkedIn public jobs",
    seeds: [
      "Malaysia",
      "Singapore",
      "Japan",
      "Taiwan",
      "Australia",
      "Worldwide",
    ].map(
      (location) =>
        `https://www.linkedin.com/jobs/search/?keywords=software%20engineer&location=${location}`,
    ),
    jobPath: "^/jobs/view/[^/]+-\\d+$",
    hosts: ["linkedin.com"],
    paging: "start",
  },
  wellfound: {
    name: "Wellfound",
    seeds: ["https://wellfound.com/jobs"],
    jobPath: "^/jobs/\\d+-[^/]+$",
    legacy: "https://wellfound.com/jobs",
  },
  builtin: {
    name: "Built In",
    seeds: [
      "https://builtin.com/jobs/remote",
      "https://builtin.com/jobs/dev-engineering",
    ],
    jobPath: "^/job/[^/]+/\\d+$",
    paging: "page",
  },
  yc: {
    name: "Y Combinator jobs",
    seeds: [
      "https://www.ycombinator.com/jobs",
      "https://www.ycombinator.com/jobs/role/designer",
      "https://www.ycombinator.com/jobs/role/product-manager",
    ],
    jobPath: "^/companies/[^/]+/jobs/[^/]+$",
  },
  japandev: {
    name: "Japan Dev",
    seeds: [
      "https://japan-dev.com/japan-jobs-relocation",
      "https://japan-dev.com/jobs",
    ],
    jobPath: "^/jobs/[^/]+/[^/]+$",
  },
  cake: {
    name: "Cake",
    seeds: ["https://www.cake.me/jobs?locale=en"],
    jobPath: "^/companies/[^/]+/jobs/[^/]+$",
    paging: "page",
  },
  arc: {
    name: "Arc",
    seeds: ["https://arc.dev/remote-jobs"],
    jobPath: "^/remote-jobs/(?:details|j)/[^/]+$",
  },
  getonboard: {
    name: "Get on Board",
    seeds: [
      "https://www.getonbrd.com/api/v0/search/jobs?query=frontend&per_page=100&lang=en&expand=%5B%22company%22%5D",
      "https://www.getonbrd.com/api/v0/search/jobs?query=software&per_page=100&lang=en&expand=%5B%22company%22%5D",
      "https://www.getonbrd.com/api/v0/search/jobs?query=AI&per_page=100&lang=en&expand=%5B%22company%22%5D",
    ],
    jobPath: "^/jobs/[^/]+$",
    paging: "page",
  },
  remotecom: {
    name: "Remote.com Jobs",
    seeds: ["https://remote.com/jobs"],
    jobPath: "^/jobs/[^/]+/[^/]+$",
  },
  nofluff: {
    name: "No Fluff Jobs",
    seeds: ["https://nofluffjobs.com/"],
    jobPath: "^/job/[^/]+$",
    paging: "page",
  },
  tryremote: {
    name: "TryRemote",
    seeds: [
      "https://tryremote.com/",
      "https://tryremote.com/remote-asia-tech-jobs",
      "https://tryremote.com/remote-react-jobs",
    ],
    jobPath: "^/remote-jobs/\\d+-[^/]+$",
  },
  remotegamejobs: {
    name: "Remote Game Jobs",
    seeds: [
      "https://remotegamejobs.com/remote-game-programming-jobs",
      "https://remotegamejobs.com/remote-game-web-development-jobs",
    ],
    jobPath: "^/jobs/[^/]+$",
  },
  jobspresso: {
    name: "Jobspresso",
    seeds: ["https://jobspresso.co/?feed=job_feed"],
    jobPath: "^/job/[^/]+$",
  },
  wantedly: {
    name: "Wantedly",
    seeds: ["https://www.wantedly.com/projects"],
    jobPath: "^/projects/\\d+$",
  },
  relocate: {
    name: "Relocate.me",
    seeds: ["https://relocate.me/international-jobs/software-engineering"],
    jobPath: "^/[^/]+/[^/]+/[^/]+/[^/]+-\\d+$",
  },
  jobstreet: {
    name: "JobStreet / SEEK",
    seeds: ["https://my.jobstreet.com/software-engineer-jobs/in-Malaysia"],
    jobPath: "^/job/\\d+$",
  },
  glints: {
    name: "Glints",
    seeds: ["https://glints.com/sg/opportunities/jobs/explore"],
    jobPath: "^/(?:sg|my|id|vn)/opportunities/jobs/[^/]+/[a-f0-9-]+$",
  },
  tokyodev: {
    name: "TokyoDev",
    seeds: ["https://www.tokyodev.com/"],
    jobPath: "^/companies/[^/]+/jobs/[^/]+$",
  },
};
export function boardFor(key: string) {
  const board = Object.hasOwn(publicBoards, key)
    ? publicBoards[key]
    : undefined;
  if (!board) throw new Error("Choose a supported public job board.");
  return board;
}
export function boardSourceDefaults(key: string) {
  const board = boardFor(key);
  return {
    name: board.name,
    type: "public_board" as const,
    identifier: key,
    enabled: false,
    requestLimit: 12,
    intervalHours: 12,
  };
}
export function boardHomepage(key: string) {
  return key === "getonboard"
    ? "https://www.getonbrd.com/"
    : key === "jobspresso"
      ? "https://jobspresso.co/remote-work/"
      : boardFor(key).seeds[0];
}
