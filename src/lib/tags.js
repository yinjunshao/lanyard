// F53: the rules for "Come to me for" tag boxes, in one place so the input, the forms and the tests agree.
// A tag list is an array of short trimmed strings; the forms keep it as the same comma separated text they
// always sent (the Worker takes up to 30 tags of 60 characters; the app has always kept 12 of 24 on a profile
// and 30 of 24 on a card, and still does). Only the non-public screens import this file.

export const PROFILE_TAGS = { max: 12, maxLength: 24 };
export const CARD_TAGS = { max: 30, maxLength: 24 };

// "a, b ,c" to ["a", "b", "c"]; empty pieces dropped (what every form did before). Case and repeats are kept.
export const parseTags = (text) => String(text || "").split(",").map((s) => s.trim()).filter(Boolean);
export const joinTags = (list) => list.join(", ");

// Adds what was typed or pasted ("Investing" or "a, b, c" or lines) to a list: each piece trimmed and cut to
// maxLength, a repeat (ignoring case) or an empty piece skipped, and nothing past `max`.
// Returns { tags, added, full }: `full` is true when something was left out because the list was full.
export function addTags(list, raw, { max = 12, maxLength = 24 } = {}) {
  const tags = [...list];
  const seen = new Set(tags.map((t) => t.toLowerCase()));
  let added = 0, full = false;
  for (const piece of String(raw ?? "").split(/[,\n\r]+/)) {
    const t = piece.replace(/\s+/g, " ").trim().slice(0, maxLength).trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    if (tags.length >= max) { full = true; continue; }
    tags.push(t); seen.add(t.toLowerCase()); added++;
  }
  return { tags, added, full };
}

export const hasTag = (list, t) => list.some((x) => x.toLowerCase() === String(t).toLowerCase());
export const removeTagAt = (list, i) => list.filter((_, j) => j !== i);

// Suggestions: five a mode, general (students of every subject, finance, people in work), none led by one kind of event.
export const SUGGESTED_TAGS = {
  student: ["Internships", "Career advice", "Study groups", "Investing", "Side projects"],
  career: ["Hiring", "Mentoring", "Industry advice", "Finance", "Partnerships"],
};
export const suggestionsFor = (mode) => SUGGESTED_TAGS[mode === "career" ? "career" : "student"];
