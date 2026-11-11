// F18: which links, tags, headline and about a card shows. A card's own come first; anything it
// leaves empty falls back to the profile's. The Worker builds every card page with this, and the
// card preview in the editors calls the very same function, so they cannot disagree.
// No imports, so the Worker can load it from here.
//
// card: { visible_links, tags, headline, about }  (visible_links: the link labels it shows; none = all)
// p:    { links, tags, headline, about }          (the profile)
export function cardFacts(card, p) {
  const picked = card.visible_links;
  return {
    links: picked?.length
      ? Object.fromEntries(picked.map((k) => [k, p.links?.[k]]).filter(([, v]) => v))
      : p.links || {},
    tags: card.tags?.length ? card.tags : p.tags || [],
    headline: card.headline || p.headline,
    about: card.about || p.about,
  };
}
