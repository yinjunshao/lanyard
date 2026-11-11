// The address a person scans or types to check in to an event (F10, F19).
// People check in on the MAIN site, never host.*, so the host's live page, the
// present page and the printed poster all take it from here and cannot differ.
import { MAIN_ORIGIN } from "./site.js";

export const joinUrl = (code) => `${MAIN_ORIGIN}/e/${code}`;
export const feedbackUrl = (code) => `${MAIN_ORIGIN}/e/${code}/feedback`;
// The same address without "https://", as it is spoken or typed ("lanyd.fyi/e/ABCDE").
export const joinText = (code) => joinUrl(code).replace(/^https?:\/\//, "");
