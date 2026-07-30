export const FITNESS_SKILL_DOMAIN_KEY = "fitness";

const SKILL_DOMAIN_ALIASES: Record<string, readonly string[]> = {
  [FITNESS_SKILL_DOMAIN_KEY]: [
    "fitness",
    "exercise",
    "training",
    "strength training",
    "strength-training",
  ],
};

export function normalizeSkillIdentity(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function getSkillDomainAliases(domain: string) {
  return SKILL_DOMAIN_ALIASES[normalizeSkillIdentity(domain)] ?? [];
}

export function resolveSkillDomainKey(value: string | null | undefined) {
  const normalized = normalizeSkillIdentity(value);
  if (!normalized) return null;

  for (const [domain, aliases] of Object.entries(SKILL_DOMAIN_ALIASES)) {
    if (normalizeSkillIdentity(domain) === normalized) return domain;
    if (aliases.some((alias) => normalizeSkillIdentity(alias) === normalized)) {
      return domain;
    }
  }

  return null;
}

export function isFitnessSkillIdentity(value: string | null | undefined) {
  return resolveSkillDomainKey(value) === FITNESS_SKILL_DOMAIN_KEY;
}
