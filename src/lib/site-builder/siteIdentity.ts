export function sanitizeSiteHandle(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/g, "")
    .slice(0, 63);
}

export function normalizeSiteHandle(value: string) {
  return sanitizeSiteHandle(value).replace(/-+$/g, "");
}

export function isValidSiteHandle(value: string) {
  return (
    value.length >= 1 &&
    value.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)
  );
}
