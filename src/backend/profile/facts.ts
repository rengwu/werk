import type { Profile } from "../../shared/profile.ts";

export function emptyProfile(): Profile {
  return {
    schemaVersion: 1,
    revision: 0,
    basics: {
      name: "",
      headline: "",
      location: "",
      summary: "",
      email: null,
      phone: null,
      website: "",
      github: "",
      linkedin: "",
      citizenship: "",
      sources: [],
    },
    experience: [],
    projects: [],
    education: [],
    awards: [],
    sources: [],
    openItems: [],
    preferences: {},
    criteria: { targetRoles: [], locations: [], arrangements: [], timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', workingHours: { start: '09:00', end: '18:00' }, minOverlapHours: 0, hiddenCompanies: [] },
  };
}
export type ProfileReadiness = {
  ready: boolean;
  missing: { field: string; label: string; question: string }[];
};
const meaningful = (value: unknown): boolean =>
  typeof value === "string" &&
  !!value.trim() &&
  !/^(unknown|unspecified|not provided|n\/?a|none|tbd)$/i.test(value.trim());
export function profileReadiness(p: Profile): ProfileReadiness {
  const roles = p.criteria.targetRoles;
  const arrangements = p.criteria.arrangements;
  const requirements = [
    {
      field: "basics.name",
      label: "Name",
      question: "What name would you like to use?",
      complete: meaningful(p.basics.name),
    },
    {
      field: "basics.location",
      label: "Current location",
      question: "Which city and country are you based in?",
      complete: meaningful(p.basics.location),
    },
    {
      field: "criteria.targetRoles",
      label: "Target roles",
      question: "What kinds of roles would you like to find?",
      complete: Array.isArray(roles)
        ? roles.some(meaningful)
        : meaningful(roles),
    },
    {
      field: "background",
      label: "Career background",
      question:
        "Tell me about your experience, skills, education or a project. If you are starting your career, tell me what you have been learning.",
      complete:
        (meaningful(p.basics.summary) &&
          p.basics.summary.trim().length >= 30) ||
        p.experience.some(
          (e) =>
            meaningful(e.employer) && e.bullets.some((b) => meaningful(b.text)),
        ) ||
        p.projects.some((e) => meaningful(e.name) && meaningful(e.summary)) ||
        p.education.some(
          (e) => meaningful(e.qualification) && meaningful(e.institution),
        ),
    },
    {
      field: "criteria.arrangements",
      label: "Work preferences",
      question:
        "Are you looking for remote, hybrid, onsite work, or any arrangement?",
      complete: Array.isArray(arrangements)
        ? arrangements.some(meaningful)
        : meaningful(arrangements),
    },
  ];
  const missing = requirements
    .filter((r) => !r.complete)
    .map(({ complete, ...r }) => r);
  return { ready: missing.length === 0, missing };
}
export function profileWelcome(p: Profile): string {
  const readiness = profileReadiness(p);
  if (readiness.ready)
    return "Your current profile is shown on the right. Tell me what you would like to add, correct, or remove. I’ll keep confirmed facts separate from preferences and unanswered questions.";
  return `Let’s build your profile. I’ll save the details you share so you can review them alongside our conversation. Job scanning will begin once we have enough information to match roles.\n\n${readiness.missing
    .slice(0, 3)
    .map((r) => `- ${r.question}`)
    .join("\n")}`;
}
