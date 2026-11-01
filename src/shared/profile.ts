import { z } from "zod";

export const criteriaSchema = z.object({
  targetRoles: z.array(z.string().trim().min(1).max(200)).max(30),
  locations: z.array(z.object({ kind: z.enum(['remote-from', 'country', 'city']), value: z.string().min(1).max(200), relocation: z.boolean().optional() })).max(50),
  arrangements: z.array(z.enum(['remote', 'hybrid', 'onsite'])).max(3),
  timezone: z.string().max(100).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Choose a valid timezone.'),
  workingHours: z.object({ start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) }),
  minOverlapHours: z.number().min(0).max(9),
  hiddenCompanies: z.array(z.string().min(1).max(200)).max(1000),
}).strict();
export type Criteria = z.infer<typeof criteriaSchema>;

const text = z.string().max(50000);
const date = z.looseObject({
  year: z.number().int().nullable(),
  month: z.number().int().min(1).max(12).nullable(),
  display: z.string().nullable(),
  precision: z.string().optional(),
});
const point = z.looseObject({
  id: z.string().min(1),
  text,
  sources: z.array(z.string()),
  status: z.string().optional(),
});
export const profileSchema = z
  .looseObject({
    schemaVersion: z.literal(1),
    revision: z.number().int().nonnegative(),
    basics: z.looseObject({
      name: z.string().max(200),
      headline: z.string(),
      location: z.string(),
      summary: text,
      email: z.string().nullable(),
      phone: z.string().nullable(),
      website: z.string(),
      github: z.string(),
      linkedin: z.string(),
      citizenship: z.string(),
      sources: z.array(z.string()),
    }),
    experience: z.array(
      z.looseObject({
        id: z.string().min(1),
        employer: z.string().min(1),
        title: z.string().nullable(),
        start: date,
        end: date,
        isCurrent: z.boolean().nullable(),
        location: z.string().nullable(),
        bullets: z.array(point),
        technologies: z.array(z.string()),
      }),
    ),
    projects: z.array(
      z.looseObject({
        id: z.string().min(1),
        name: z.string(),
        url: z.string(),
        summary: text,
        bullets: z.array(text),
        technologies: z.array(z.string()),
        attribution: z.string().optional(),
        sources: z.array(z.string()),
      }),
    ),
    education: z.array(
      z.looseObject({
        id: z.string(),
        institution: z.string(),
        qualification: z.string(),
        specialization: z.string().optional(),
        start: date,
        end: date,
      }),
    ),
    awards: z.array(
      z.looseObject({
        id: z.string(),
        name: z.string(),
        result: z.string(),
        year: z.number(),
        description: text.optional(),
      }),
    ),
    sources: z.array(
      z.looseObject({
        id: z.string(),
        type: z.string(),
        url: z.string().optional(),
        description: text.optional(),
        localEvidenceFile: z.string().optional(),
      }),
    ),
    openItems: z.array(
      z.looseObject({
        id: z.string(),
        field: z.string(),
        question: z.string(),
        blocks: z.string(),
      }),
    ),
    preferences: z.record(z.string(), z.unknown()),
    criteria: criteriaSchema,
    facts: z
      .array(
        z.object({
          id: z.string().min(1),
          category: z.string().min(1),
          text,
          status: z.enum(["confirmed", "preference", "inferred"]),
          sources: z.array(z.string()),
        }),
      )
      .optional(),
  })
  .superRefine((p, ctx) => {
    const ids = [
      ...p.experience,
      ...p.projects,
      ...p.education,
      ...p.awards,
      ...(p.facts || []),
    ].map((x) => x.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message:
          "Experience, project, education, award, and fact IDs must be unique.",
      });
    const sources = new Set(p.sources.map((s) => s.id));
    if (sources.size !== p.sources.length)
      ctx.addIssue({ code: "custom", message: "Source IDs must be unique." });
    for (const record of [p.basics, ...p.projects, ...(p.facts || [])])
      for (const source of record.sources)
        if (!sources.has(source))
          ctx.addIssue({
            code: "custom",
            message: `Unknown source ${source}.`,
          });
    for (const e of p.experience)
      for (const b of e.bullets)
        for (const s of b.sources)
          if (!sources.has(s))
            ctx.addIssue({
              code: "custom",
              message: `Unknown source ${s} in ${b.id}`,
            });
  });
export type Profile = z.infer<typeof profileSchema>;
