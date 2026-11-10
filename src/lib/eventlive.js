// F15: whether an event you checked in to is on right now, for the dot on the Events tab.
// Only /app pages import this (the frame and the two events pages), never a public page.
import { reactive } from "vue";
import { Api } from "./api";
import { eventStatus } from "./eventstatus";

export const live = reactive({ ongoing: false, at: 0 });

// The pages that already hold the list pass it in, so the tab never asks twice.
export function setLive(events, now = Date.now()) {
  live.ongoing = (events || []).some((e) => eventStatus(e, e.checkedInAt, now) === "ongoing");
  live.at = Date.now();
}

// At most one request in flight, and none more often than `maxAgeMs` unless forced.
let pending = null;
export function refreshLive(maxAgeMs = 120000) {
  if (pending || Date.now() - live.at < maxAgeMs) return pending || Promise.resolve();
  pending = Api.myEvents()
    .then((r) => setLive(r.events, r.now))
    .catch(() => {})
    .finally(() => { pending = null; });
  return pending;
}
