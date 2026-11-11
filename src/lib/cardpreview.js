// F18: the card preview's data. It turns what is in an editor into the same view the card page
// is given, trimming and cutting as the Worker does when it saves (test/preview.mjs saves real
// cards and profiles and compares). Which links, tags, headline and about a card shows comes
// from cardFacts(), the function the Worker itself uses. Only the card editors import this file.
import { cardFacts } from "./cardmerge.js";

const text = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const strings = (arr, max, len) =>
  (Array.isArray(arr) ? arr : []).filter((x) => typeof x === "string" && x.trim()).slice(0, max).map((x) => x.trim().slice(0, len));

// A profile as the card page is given it, from what Edit profile would save (`input`),
// the photo address to show, and the profile's saved projects (the editor does not change them).
export function profileOf(input, photo, projects) {
  const links = {};
  for (const [label, url] of Object.entries(input.links || {})) {
    if (/^https?:\/\//.test(String(url)) && label.length <= 40) links[label.slice(0, 40)] = String(url).slice(0, 300);
  }
  return {
    name: text(input.name, 400), photo: photo || null,
    uni: text(input.uni, 400).slice(0, 120), course: text(input.course, 400), year: text(input.year, 400),
    mode: input.mode === "career" ? "career" : "student",
    company: text(input.company, 80), role: text(input.role, 80),
    headline: text(input.headline, 400), about: text(input.about, 400),
    links,
    tags: (Array.isArray(input.tags) ? input.tags : []).slice(0, 30).map((x) => String(x).slice(0, 60)),
    projects: (projects || []).map((pr) => ({ ...pr, image: pr.image_key ? `/media/${pr.image_key}` : null })),
  };
}

// A card as the card page is given it, from a card form (Cards.vue). `tags` is already a list.
export function cardOf(form, { tags, cardId = null, code = null, creating = false } = {}) {
  return {
    cardId, code,
    name: String(form.name || (creating ? "Card" : "")).slice(0, 60),
    note: String(form.note || "").slice(0, 300),
    theme: String(form.theme || "default").slice(0, 60),
    strapColor: form.strapColor || null,
    visibleLinks: strings(form.visibleLinks, 20, 40),
    tags: strings(tags, 30, 60),
    headline: String(form.headline || "").trim().slice(0, 80),
    about: String(form.about || "").trim().slice(0, 600),
  };
}

// What a scan opens for `card` on `profile`: the shape the Worker returns for /api/c/:id,
// as a stranger sees it (not the owner, nothing connected, nothing in common).
export function viewOf(profile, card) {
  const f = cardFacts({ visible_links: card.visibleLinks, tags: card.tags, headline: card.headline, about: card.about }, profile);
  return {
    cardId: card.cardId, name: card.name, note: card.note, theme: card.theme, strapColor: card.strapColor,
    ...(card.code ? { code: card.code } : {}),
    viewer: { isOwner: false },
    profile: { ...profile, headline: f.headline, about: f.about, links: f.links, tags: f.tags },
  };
}
