// The one line under a name (F11). Student: "Course · University" (with the
// year after, where the screen asks for it). Career: "Role at Company", plus
// "Studied at ..." when that is filled in. Only the chosen mode's fields show;
// the other mode's are kept on the profile but never printed.
export const isCareer = (p) => p?.mode === "career";

export function subtitleParts(p, { year = false } = {}) {
  if (!p) return [];
  const t = (v) => (typeof v === "string" ? v.trim() : "");
  if (isCareer(p)) {
    const role = t(p.role), company = t(p.company), uni = t(p.uni);
    return [role && company ? `${role} at ${company}` : role || company, uni && `Studied at ${uni}`].filter(Boolean);
  }
  return [t(p.course), t(p.uni), year && t(p.year)].filter(Boolean);
}

export const subtitleOf = (p, opts) => subtitleParts(p, opts).join(" · ");
