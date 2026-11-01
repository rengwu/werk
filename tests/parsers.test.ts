// Parser regressions ported deliberately from the archived public implementation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Source,IncomingJob} from '../src/backend/sources/types.ts';
import {normalizeHimalayas,normalizeFourDayWeek,normalizeRemoteOk,normalizeRemotive,normalizeArbeitnow,normalizeJobicy,normalizeRss,normalizeWorkingNomads,collectDiscovery} from '../src/backend/sources/discovery.ts';
import {readJson,RequestLimitError} from '../src/backend/http.ts';
import {publicBoards,boardSourceDefaults} from '../src/backend/sources/boards/catalog.ts';
import {jobUrl,lead,itemId,parseBoardListing,parseBoardDetail} from '../src/backend/sources/boards/parsers.ts';
import {buildLocationIndex,locationLabel,locationOptions,matchesLocations,parseLocationSelection,searchLocation} from '../src/backend/geo/locations.ts';
const source=(type:Source['type'],identifier:string):Source=>({id:'fixture',name:'Fixture feed',type,identifier,enabled:true,requestLimit:2,state:'idle',lastRunAt:null,nextRunAt:null,lastError:null,jobCount:0,checkpoint:{}});
const values=(raw:string)=>locationOptions(raw).map(option=>option.value);
const prose='Build customer-facing software with TypeScript and React. Own accessible interfaces, collaborate with designers, review changes and ship reliable products. Applicants must already be authorized to work in the United States. Visa sponsorship is not available.';
const posting=(url:string,extra={})=>'<script type="application/ld+json">'+JSON.stringify({'@graph':[{'@type':'JobPosting',url,title:'Product engineer',hiringOrganization:{name:'Example'},description:'<p>'+prose+'</p>',datePosted:'2026-09-01',jobLocation:{address:{addressLocality:'Austin',addressCountry:'US'}},...extra}]})+'</script>';
const nextData=(page:unknown)=>'<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:page}})+'</script>';
test("public API normalization preserves actual employer, restrictions, source links, dates and salary units", () => {
  const h = normalizeHimalayas({
    jobs: [
      {
        guid: "https://himalayas.app/jobs/example",
        applicationLink: "https://himalayas.app/jobs/example",
        title: "Frontend engineer",
        companyName: "Example",
        pubDate: 1789498898,
        expiryDate: 1794682897000,
        locationRestrictions: ["Malaysia", "Singapore"],
        timezoneRestrictions: [8],
        salaryPeriod: "annual",
        minSalary: 50000,
        maxSalary: 70000,
        currency: "USD",
        description: "<p>Build interfaces</p>",
      },
    ],
  })[0];
  assert.equal(h.publishedAt, new Date(1789498898000).toISOString());
  assert.equal(h.expiresAt, new Date(1794682897000).toISOString());
  assert.equal(h.location, "Malaysia · Singapore");
  assert.equal(h.company, "Example");
  assert.equal(h.salary, "USD 50000–70000 / annual");
  assert.match(h.description, /UTC offsets.*8/);
  assert.equal(
    normalizeHimalayas({
      jobs: [{ guid: "https://himalayas.app/x", title: "Engineer" }],
    })[0].location,
    "Not specified",
  );
  const f = normalizeFourDayWeek({
    data: [
      {
        id: "4d",
        title: "Product Engineer",
        url: "https://4dayweek.io/job/example",
        company: { name: "Product Co" },
        locations: [{ city: "London", country: "UK" }],
        salary_min: 8000000,
        salary_max: 10000000,
        salary_currency: "GBP",
        salary_period: "year",
        schedule_type: "generous_pto",
        hours_per_week_max: 40,
      },
    ],
  })[0];
  assert.equal(f.salary, "GBP 80000–100000 / year");
  assert.match(f.description, /generous pto/);
  assert.ok(!f.description.includes("4 day"));
  const r = normalizeRemoteOk([
    { legal: "Terms" },
    {
      id: 1,
      position: "Engineer",
      company: "Remote Co",
      url: "https://remoteok.com/remote-jobs/1",
      salary_min: 100000,
    },
  ]);
  assert.equal(r.length, 1);
  assert.match(r[0].salary, /not fully specified/);
  assert.ok(!r[0].salary.includes("USD"));
  assert.equal(
    normalizeRemotive({
      jobs: [
        {
          id: 1,
          title: "Engineer",
          url: "https://remotive.com/jobs/1",
          salary: "",
          candidate_required_location: "Europe",
        },
      ],
    })[0].salary,
    "",
  );
  assert.equal(
    normalizeArbeitnow({
      data: [
        {
          slug: "a",
          title: "Engineer",
          url: "https://www.arbeitnow.com/jobs/a",
          remote: false,
        },
      ],
    })[0].arrangement,
    "Unspecified",
  );
  assert.equal(
    normalizeJobicy({
      jobs: [
        {
          id: 1,
          jobTitle: "Engineer",
          url: "https://jobicy.com/jobs/1",
          jobGeo: "APAC",
          jobType: ["Full-Time"],
          salaryMin: 10000,
          salaryMax: 15000,
          salaryCurrency: "MYR",
          salaryPeriod: "monthly",
        },
      ],
    })[0].salary,
    "MYR 10000–15000 / monthly",
  );
  assert.throws(
    () => normalizeJobicy({ error: "unavailable" }),
    /missing jobs array/,
  );
});

test("RSS uses board-specific employer/location fields and keeps missing descriptions as leads", () => {
  const wwr = normalizeRss(
    "<rss><channel><item><title>Acme: Senior Frontend Engineer</title><region>Europe only</region><link>https://weworkremotely.com/jobs/1</link><description>&lt;p&gt;" +
      "Build web interfaces. ".repeat(20) +
      "&lt;/p&gt;</description></item></channel></rss>",
    source("rss", "https://weworkremotely.com/remote-jobs.rss"),
  )[0];
  assert.equal(wwr.company, "Acme");
  assert.equal(wwr.title, "Senior Frontend Engineer");
  assert.equal(wwr.location, "Europe only");
  assert.equal(wwr.kind, "opening");
  const lara = normalizeRss(
    "<rss><channel><item><title>Lead Developer</title><link>https://larajobs.com/job/1</link><job:company>Laravel Co</job:company><job:location>USA / Canada</job:location><job:job_type>FULL_TIME</job:job_type><description> </description><content:encoded> </content:encoded></item></channel></rss>",
    source("rss", "https://larajobs.com/feed"),
  )[0];
  assert.equal(lara.company, "Laravel Co");
  assert.equal(lara.location, "USA / Canada");
  assert.equal(lara.description, "");
  assert.equal(lara.kind, "lead");
  const go = normalizeRss(
    "<rss><channel><item><title>Agent Engineer @ ngrok</title><link>https://www.golangprojects.com/example.html</link><description>San Francisco, United States - Short excerpt...</description></item></channel></rss>",
    source("rss", "https://www.golangprojects.com/rss.xml"),
  )[0];
  assert.equal(go.company, "ngrok");
  assert.equal(go.title, "Agent Engineer");
  assert.equal(go.kind, "lead");
  const atom = normalizeRss(
    '<feed><entry><title>Engineer</title><link rel="alternate" href="https://example.com/job"/><content>Body</content></entry><entry><title>Invalid</title><link href="javascript:alert(1)"/></entry></feed>',
    source("rss", "https://example.com/feed"),
  );
  assert.equal(atom.length, 1);
  assert.equal(atom[0].company, "Not listed");
});

test("4 Day Week refreshes latest jobs while bounded older-page collection resumes", async () => {
  let checkpoint: Record<string, unknown> = { page: 7 };
  const pages: number[] = [];
  const reader: typeof readJson = async <T>(
    url: string,
    ctx: Parameters<typeof readJson>[1],
  ) => {
    ctx.requests++;
    pages.push(Number(new URL(url).searchParams.get("page")));
    return {
      data: [
        {
          id: pages.at(-1),
          title: "Engineer",
          url: `https://4dayweek.io/job/${pages.at(-1)}`,
        },
      ],
      has_more: true,
    } as T;
  };
  const s = source("fourdayweek", "engineering");
  await collectDiscovery(
    { ...s, checkpoint },
    { requests: 0, limit: 3 },
    () => {},
    (c) => (checkpoint = c),
    reader,
  );
  assert.deepEqual(pages, [1, 7, 8]);
  assert.equal(checkpoint.page, 9);
  pages.length = 0;
  await collectDiscovery(
    { ...s, checkpoint },
    { requests: 0, limit: 2 },
    () => {},
    (c) => (checkpoint = c),
    reader,
  );
  assert.deepEqual(pages, [1, 9]);
  assert.equal(checkpoint.page, 10);
});

test("Himalayas resumes interrupted query pagination without skipping a query", async () => {
  let checkpoint: Record<string, unknown> = {};
  const requested: string[] = [];
  const reader: typeof readJson = async <T>(
    raw: string,
    ctx: Parameters<typeof readJson>[1],
  ) => {
    if (ctx.requests >= ctx.limit) throw new RequestLimitError("Limit");
    ctx.requests++;
    const url = new URL(raw);
    requested.push(
      `${url.searchParams.get("q")}:${url.searchParams.get("page")}`,
    );
    return {
      jobs: Array.from({ length: 20 }, (_, i) => ({
        guid: `https://himalayas.app/jobs/${i}`,
        title: "Engineer",
      })),
    } as T;
  };
  const s = source("himalayas", "frontend|AI engineer");
  await assert.rejects(
    collectDiscovery(
      s,
      { requests: 0, limit: 1 },
      () => {},
      (c) => (checkpoint = c),
      reader,
    ),
    RequestLimitError,
  );
  assert.deepEqual(checkpoint, { queryIndex: 0, page: 2 });
  await collectDiscovery(
    { ...s, checkpoint },
    { requests: 0, limit: 3 },
    () => {},
    (c) => (checkpoint = c),
    reader,
  );
  assert.deepEqual(requested, [
    "frontend:1",
    "frontend:2",
    "AI engineer:1",
    "AI engineer:2",
  ]);
  assert.deepEqual(checkpoint, {});
});

test("full RSS content is preserved ahead of summaries while API excerpts remain provisional", () => {
  const full = "Build React product interfaces. ".repeat(30);
  const rss = normalizeRss(
    `<rss><channel><item><title>Engineer</title><link>https://example.com/job/full</link><description>Summary...</description><content:encoded><![CDATA[<p>${full}</p>]]></content:encoded></item></channel></rss>`,
    source("rss", "https://example.com/feed"),
  )[0];
  assert.equal(rss.description, full.trim());
  assert.equal(rss.descriptionQuality, "full");
  assert.equal(rss.kind, "opening");
  const excerpt = normalizeJobicy({
    jobs: [
      {
        id: 1,
        jobTitle: "Engineer",
        url: "https://jobicy.com/job/1",
        jobExcerpt: full,
      },
    ],
  })[0];
  assert.equal(excerpt.descriptionQuality, "excerpt");
  assert.equal(excerpt.kind, "lead");
  assert.equal(
    normalizeHimalayas({
      jobs: [
        {
          guid: "https://himalayas.app/job/1",
          title: "Engineer",
          excerpt: full,
        },
      ],
    })[0].descriptionQuality,
    "excerpt",
  );
});

test("discovery accepts only vacancy routes on the intended board and keeps stable LinkedIn IDs", () => {
  for (const u of [
    "https://wellfound.com.evil.test/jobs/123-test",
    "https://user@wellfound.com/jobs/123-test",
    "https://wellfound.com/login",
    "https://127.0.0.1/jobs/123-test",
  ])
    assert.equal(jobUrl("wellfound", u), null);
  const a = lead(
    "linkedin",
    jobUrl(
      "linkedin",
      "https://my.linkedin.com/jobs/view/engineer-123?tracking=secret",
    )!,
  );
  const b = lead(
    "linkedin",
    jobUrl(
      "linkedin",
      "https://sg.linkedin.com/jobs/view/renamed-engineer-123",
    )!,
  );
  assert.equal(a.sourceItemId, b.sourceItemId);
  assert.doesNotMatch(a.url, /tracking/);
  assert.equal(
    jobUrl(
      "relocate",
      "https://relocate.me/remote/remote/the-global-move/paid-option-10080",
    ),
    null,
  );
  assert.throws(
    () =>
      parseBoardListing(
        "wellfound",
        "<h1>Sign in</h1>",
        publicBoards.wellfound.seeds[0],
      ),
    /No readable/,
  );
});

test("Hiredly uses employer sections instead of truncated schema or AI summary", () => {
  const url =
    "https://my.hiredly.com/jobs/jobs-malaysia-example-product-engineer";
  const job = {
    slug: "jobs-malaysia-example-product-engineer",
    title: "Product engineer",
    company: { name: "Example" },
    location: "Kuala Lumpur",
    description: `<p>${prose}</p>`,
    requirements: "<p>Five years of experience.</p>",
    gptSummary: "Fabricated AI summary",
    salary: "12000 - 18000",
  };
  const parsed = parseBoardDetail(
    "hiredly",
    nextData({ job }) + posting(url, { description: "Short summary..." }),
    lead("hiredly", url),
  );
  assert.match(parsed.description, /Five years/);
  assert.doesNotMatch(parsed.description, /Fabricated|Short summary/);
  assert.equal(parsed.salary, "MYR 12000 - 18000");
  const listing = parseBoardListing(
    "hiredly",
    nextData({
      jobs: Array.from({ length: 30 }, (_, n) => ({
        ...job,
        slug: `jobs-${n}`,
        description: undefined,
        requirements: undefined,
      })),
    }),
    publicBoards.hiredly.seeds[0],
  );
  assert.match(listing.next!, /page=1/);
  assert.equal(listing.jobs[0].descriptionQuality, "excerpt");
  assert.deepEqual(
    parseBoardListing(
      "hiredly",
      nextData({ jobs: [] }),
      publicBoards.hiredly.seeds[0],
    ),
    { jobs: [], next: null },
  );
});

test("visible TryRemote and No Fluff sections retain requirements missing from JSON-LD", () => {
  for (const [key, url, section] of [
    [
      "tryremote",
      "https://tryremote.com/remote-jobs/123-engineer",
      `<div class="job-description">${prose}</div>`,
    ],
    [
      "nofluff",
      "https://nofluffjobs.com/job/example-engineer",
      `<div id="posting-requirements">English and Polish required.</div><section id="posting-description">${prose}</section><div id="posting-tasks">Own the frontend.</div>`,
    ],
  ]) {
    const parsed = parseBoardDetail(
      key,
      posting(url, { description: "An excerpt..." }) + section,
      lead(key, url),
    );
    assert.equal(parsed.descriptionQuality, "full");
    assert.match(parsed.description, /authorized to work/);
    if (key === "nofluff")
      assert.match(parsed.description, /English and Polish/);
  }
});

test("publisher JSON-LD with raw line breaks is recovered without executing scripts", () => {
  const url = "https://relocate.me/japan/tokyo/example/engineer-123";
  const html = posting(url).replace(
    "Build customer-facing",
    "Build\ncustomer-facing",
  );
  const job = parseBoardDetail("relocate", html, lead("relocate", url));
  assert.match(job.description, /customer-facing/);
});

test("Wantedly uses the visible project sections when its structured description is cut short", () => {
  const url = "https://www.wantedly.com/projects/123";
  const html =
    posting(url, { description: "A short intro..." }) +
    `<section class="ProjectDescription__Section-sc-example">${prose}</section>`;
  assert.equal(
    parseBoardDetail("wantedly", html, lead("wantedly", url))
      .descriptionQuality,
    "full",
  );
});

test("Get on Board detail identity remains compatible with its API IDs during revalidation", () => {
  const url = "https://www.getonbrd.com/jobs/product-engineer-example";
  assert.equal(itemId("getonboard", url), "product-engineer-example");
  assert.equal(
    parseBoardDetail("getonboard", posting(url), lead("getonboard", url))
      .company,
    "Example",
  );
});

test("location facets separate explicit places and normalize common aliases without guessing countries", () => {
  assert.deepEqual(values("Remote - U.S. · USA · United States"), [
    "united states",
  ]);
  assert.deepEqual(values("London, UK | Singapore · Kuala Lumpur, Malaysia"), [
    "london",
    "united kingdom",
    "singapore",
    "kuala lumpur",
    "malaysia",
  ]);
  assert.deepEqual(values("Remote (US, Canada)"), ["united states", "canada"]);
  assert.deepEqual(values("Singapore (Remote) / Malaysia only"), [
    "singapore",
    "malaysia",
  ]);
  assert.deepEqual(values("San Francisco, CA"), ["san francisco", "ca"]);
  assert.ok(!values("San Francisco, CA").includes("canada"));
  assert.deepEqual(values("London"), ["london"]);
  assert.deepEqual(values("Montréal, Quebec"), ["montreal", "quebec"]);
  assert.deepEqual(values("Asia-Pacific"), ["apac"]);
});

test("remote and missing locations stay unspecified; worldwide requires an explicit unrestricted statement", () => {
  for (const raw of [
    "",
    "Remote",
    "Fully remote",
    "Not specified",
    "N/A",
    "Remote / Flexible",
  ])
    assert.deepEqual(values(raw), ["__unspecified__"], raw);
  for (const raw of ["Worldwide", "Anywhere in the World", "Remote, Global"])
    assert.deepEqual(values(raw), ["__worldwide__"], raw);
  for (const raw of [
    "Worldwide except US",
    "Worldwide (except US)",
    "Worldwide, excluding United States",
    "Outside US",
  ])
    assert.ok(
      !values(raw).some((value) =>
        ["__worldwide__", "united states"].includes(value),
      ),
      raw,
    );
});

test("multi-select uses OR across locations and keeps worldwide and unspecified independently selectable", () => {
  const jobs = [
    { id: "my", location: "Kuala Lumpur, Malaysia" },
    { id: "sg", location: "Singapore" },
    { id: "eu", location: "Europe" },
    { id: "remote", location: "Remote" },
    { id: "global", location: "Worldwide" },
  ];
  const index = buildLocationIndex(jobs);
  const match = (selected: string[]) =>
    jobs
      .filter((j) => matchesLocations(index.byJob.get(j.id), selected))
      .map((j) => j.id);
  assert.deepEqual(
    match([]),
    jobs.map((j) => j.id),
  );
  assert.deepEqual(match(["malaysia", "singapore"]), ["my", "sg"]);
  assert.deepEqual(match(["malaysia", "__worldwide__", "__unspecified__"]), [
    "my",
    "remote",
    "global",
  ]);
  assert.deepEqual(match(["missing-location"]), []);
  assert.deepEqual(
    index.options.slice(0, 2).map((o) => o.label),
    ["Worldwide", "Unspecified"],
  );
});

test("location search handles aliases, accents, and empty results without substring country mistakes", () => {
  assert.equal(
    searchLocation({ label: "United States", value: "united states" }, "USA"),
    true,
  );
  assert.equal(
    searchLocation({ label: "Australia", value: "australia" }, "US"),
    false,
  );
  assert.equal(
    searchLocation({ label: "Montréal", value: "montreal" }, "montreal"),
    true,
  );
  assert.equal(
    searchLocation({ label: "Singapore", value: "singapore" }, "malaysia"),
    false,
  );
  assert.equal(
    searchLocation(
      { label: "Unspecified", value: "__unspecified__" },
      "unknown",
    ),
    true,
  );
});

test("location filters restore safely from session storage", () => {
  assert.deepEqual(parseLocationSelection(null), []);
  assert.deepEqual(parseLocationSelection("not JSON"), []);
  assert.deepEqual(parseLocationSelection('{"value":"malaysia"}'), []);
  assert.deepEqual(
    parseLocationSelection('["malaysia",false,"singapore","malaysia",""]'),
    ["malaysia", "singapore"],
  );
});