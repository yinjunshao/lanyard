// F60: the words of the "Suggest me" notice on the check-in page, the event hub and Settings, and their
// version. One file, no imports, read by the Worker (which records the exact words with each choice in
// consent_log) and by the pages (which show them), so what was shown and what was recorded cannot differ.
// Change a word here and bump SUGGEST_VERSION. D054.

export const SUGGEST_VERSION = "2026-11-24";
export const INTENTION_MAX = 120;

export const INTENTION_LABEL = "What are you hoping to get from this event?";
// The tick's own words: this is what is recorded, word for word, as the notice the person saw.
export const SUGGEST_NOTICE = "Suggest me to people here. Others checked in see your name, headline and tags, and your intention if you write one.";
// The small print under the tick.
export const SUGGEST_DETAIL = "Only your first name and last initial, never your card, links or contact details. A photo only if you turn on Be easy to find. On to start with: untick it and you can still check in. Change it any time on this event's page or in Settings. Deleted 48 hours after the event.";
