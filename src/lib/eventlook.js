// F65 (D060): what an event's strap looks like, and the one rule for the words on it. Read by the Worker and by the host's forms
// (never by the check-in page, which gets the answer as data). The automatic ink (white or black, whichever reads better) always
// reaches 4.58:1 or more on any colour, so a brand colour is never refused for its automatic ink; the only way to fail is a
// text colour the host chose on purpose, and that is refused with INK_LOW.
import { contrast, strapInk, strictHex } from "./cardcolour.js";
import { themeOf } from "./eventthemes.js";

// The two colours a host may choose for the words on the strap, besides Automatic. Dark is the card's own near-black.
export const INK_CHOICES = [
  { value: "#FFFFFF", name: "White" },
  { value: "#1B1A17", name: "Dark" },
];
export const INK_MIN = 4.5;
export const INK_LOW = "That text colour is hard to read on this strap colour. Use Automatic, or the other choice.";

// A saved text colour: one of the two exact values (capitals), or null for Automatic. Anything else is Automatic.
export const cleanInk = (v) => {
  const h = strictHex(v);
  return h && INK_CHOICES.some((c) => c.value === h) ? h : null;
};
// The strap colour in effect: the host's colour, else the theme's own.
export const strapIn = (theme, strapColor) => strictHex(strapColor) || themeOf(theme).strap;
export const inkReads = (ink, strap) => !!strictHex(ink) && !!strictHex(strap) && contrast(ink, strap) >= INK_MIN;
// The ink the page draws, "#RRGGBB": the host's choice, else white or black by the strap colour, else the theme's own.
export const inkOf = (theme, strapColor, ink) => cleanInk(ink) || (strictHex(strapColor) ? strapInk(strapColor) : themeOf(theme).ink);
// An events row as the pages are given it: the words on the strap, only when the host set a colour or a text colour (a plain
// theme sends none, and the theme's own CSS draws it).
export const inkIn = (ev) => (ev.strap_ink || ev.strap_color ? inkOf(ev.theme, ev.strap_color, ev.strap_ink) : null);
