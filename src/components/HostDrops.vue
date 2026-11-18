<script setup>
// F32: drops, the host's side. Host pages only: it rides in the host event chunk with HostLive, so no public
// page loads it. A drop gives each checked-in person something only they can see: a key, a code, a password
// or a lunch voucher. The host sees counts. The only items that ever come back to this page are the ones
// nobody was given, and only as a file the host asks for. Pasted text is cleared from the page as soon as
// it is saved, and nothing here keeps it in storage.
import { computed, onMounted, ref } from "vue";
import { api } from "../lib/api";
import UiDateTimePicker from "./ui/UiDateTimePicker.vue";
import Waiting from "./Waiting.vue";

const props = defineProps({ eventId: { type: String, required: true } });
const base = computed(() => `/api/host/events/${encodeURIComponent(props.eventId)}/drops`);

const KINDS = [
  { key: "one_each", label: "One each from a list", help: "Paste API keys, codes or links. Each person gets the next unused one, and no item goes to two people." },
  { key: "random", label: "Random from a list", help: "Paste a list. Each person gets one at random." },
  { key: "same", label: "Same for everyone", help: "One text for everyone, such as a Wi-Fi password." },
  { key: "voucher", label: "Voucher", help: "Lunch, a drink or any one-off perk. Each person gets a QR code; staff scan it with a link you send them." },
];
const kindLabel = (k) => KINDS.find((x) => x.key === k)?.label || k;

const data = ref(null);
const loading = ref(true);
const error = ref("");
const busy = ref("");
const notice = ref("");
const confirm = ref(""); // "<drop id>:<action>" waiting for a second tap
const linkShown = ref(null); // { dropId, title, url, from, until }: a new scanner link, shown once
const copiedLink = ref(false);

async function load() {
  loading.value = true;
  try { data.value = await api(base.value); error.value = ""; }
  catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}
onMounted(load);

/* ----------------------------------- making one ----------------------------------- */
const blank = () => ({ kind: "one_each", title: "", note: "", items: "", value: "", reuse: false, perPerson: 1, validFrom: null, validUntil: null });
const form = ref(blank());
const opening = ref(false);
const listKind = computed(() => form.value.kind === "one_each" || form.value.kind === "random");

async function make() {
  if (busy.value) return;
  busy.value = "make"; error.value = ""; notice.value = "";
  const f = form.value;
  const body = { kind: f.kind, title: f.title, note: f.note, validFrom: f.validFrom, validUntil: f.validUntil };
  if (f.kind === "same") body.value = f.value;
  if (listKind.value) { body.items = f.items; body.reuse = f.kind === "random" && f.reuse; }
  if (f.kind === "voucher") body.perPerson = Number(f.perPerson);
  try {
    const r = await api(base.value, "POST", body);
    const title = f.title;
    form.value = blank(); // the pasted text leaves the page here
    opening.value = false;
    notice.value = listKind.value || f.kind === "same" ? `${title} is on. ${r.loaded} loaded${r.duplicates ? `, ${r.duplicates} repeated line${r.duplicates === 1 ? "" : "s"} left out` : ""}.` : `${title} is on.`;
    await load();
  } catch (e) { error.value = e.message; }
  finally { busy.value = ""; }
}

/* --------------------------------- one drop's actions --------------------------------- */
const adding = ref(""); // the drop id whose "add more" box is open
const addText = ref("");

async function act(d, what, fn) {
  if (busy.value) return;
  busy.value = d.id + ":" + what; error.value = ""; notice.value = "";
  try { await fn(); await load(); }
  catch (e) { error.value = e.message; }
  finally { busy.value = ""; confirm.value = ""; }
}
const setStatus = (d, status) => act(d, "status", () => api(`${base.value}/${d.id}`, "PUT", { status }));
function twice(d, what, fn) {
  const key = d.id + ":" + what;
  if (confirm.value !== key) { confirm.value = key; return; }
  return act(d, what, fn);
}
const delUnused = (d) => twice(d, "unused", async () => { const r = await api(`${base.value}/${d.id}/unused`, "DELETE"); notice.value = `${r.deleted} unused item${r.deleted === 1 ? "" : "s"} deleted.`; });
// F40: the scanner link for a voucher. A new one replaces the old one, so when one is out already it asks twice.
async function makeLink(d) {
  if (busy.value) return;
  const fn = async () => {
    const r = await api(`${base.value}/${d.id}/scanner`, "POST");
    linkShown.value = { dropId: d.id, title: d.title, url: r.url, from: r.from, until: r.until };
    copiedLink.value = false;
  };
  return d.scanner ? twice(d, "link", fn) : act(d, "link", fn);
}
const stopLink = (d) => twice(d, "stoplink", async () => {
  await api(`${base.value}/${d.id}/scanner`, "DELETE");
  if (linkShown.value?.dropId === d.id) linkShown.value = null;
  notice.value = `The scanner link for ${d.title} is stopped. Anyone who opens it now sees "Scanner closed".`;
});
async function copyLink() {
  try { await navigator.clipboard.writeText(linkShown.value.url); copiedLink.value = true; } catch { copiedLink.value = false; }
}
async function shareLink() {
  try { await navigator.share({ title: `Scanner: ${linkShown.value.title}`, url: linkShown.value.url }); } catch { /* closed, or not supported */ }
}
const canShare = typeof navigator !== "undefined" && !!navigator.share;
const windowText = (w) => (w.from || w.until ? `Works${w.from ? ` from ${when(w.from)}` : ""}${w.until ? ` until ${when(w.until)}` : ""}.` : "Works while the voucher is on.");
const pct = (n, of) => (of ? Math.min(100, Math.round((n / of) * 100)) : 0);
const delDrop = (d) => twice(d, "drop", () => api(`${base.value}/${d.id}`, "DELETE"));
async function saveMore(d) {
  await act(d, "add", async () => {
    const r = await api(`${base.value}/${d.id}/items`, "POST", { items: addText.value });
    addText.value = ""; adding.value = "";
    notice.value = `${r.added} added${r.alreadyThere ? `, ${r.alreadyThere} already there` : ""}. ${r.loaded} loaded now.`;
  });
}
// The unused items, as a file. A POST (it is logged), turned into a download here and then forgotten.
async function download(d) {
  await act(d, "download", async () => {
    const res = await fetch(`${base.value}/${d.id}/unused`, { method: "POST", credentials: "same-origin" });
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || "Couldn't download them. Try again."); }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url; a.download = `${d.title.replace(/[^A-Za-z0-9 _-]/g, "").trim().replace(/\s+/g, "-") || "drop"}-unused.txt`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice.value = "Downloaded. This file holds real keys: delete it when you have used it.";
  });
}

/* ------------- who has it: only for an event that keeps a list of who checked in (F31) ------------- */
const who = ref({}); // drop id -> { people, others, kind } while open
async function toggleWho(d) {
  if (who.value[d.id]) { const { [d.id]: _gone, ...rest } = who.value; who.value = rest; return; }
  await act(d, "who", async () => { who.value = { ...who.value, [d.id]: await api(`${base.value}/${d.id}/people`) }; });
}
// Withdraw and replace (F34): one step for a list drop whose items go to one person each. The old item is wiped and
// the person is given the next unused one; with none left, nothing changes and the server says so.
const canReplace = (d) => d.kind === "one_each" || (d.kind === "random" && !d.reuse);
const replace = (d, p) => twice(d, "r" + p.giveId, async () => {
  await api(`${base.value}/${d.id}/replace`, "POST", { giveId: p.giveId });
  who.value = { ...who.value, [d.id]: await api(`${base.value}/${d.id}/people`) };
  notice.value = `${p.name} has a new item. The old one is withdrawn and won't be given to anyone else. They see the new one the next time they open the drop.`;
});
const withdraw = (d, p) => twice(d, "w" + p.giveId, async () => {
  await api(`${base.value}/${d.id}/revoke`, "POST", { giveId: p.giveId });
  who.value = { ...who.value, [d.id]: await api(`${base.value}/${d.id}/people`) };
  notice.value = `${p.name}'s item is withdrawn. It won't be given to anyone else.`;
});

/* ---------------------------------- words for a drop ---------------------------------- */
const counts = (d) => {
  if (d.purged) return d.kind === "voucher" ? `Cleared away. ${d.used} used in all.` : `Cleared away. ${d.loaded} were loaded and ${d.given} given.`;
  if (d.kind === "voucher") return `${d.people} of ${d.checkedIn} scanned`;
  if (d.kind === "same") return `${d.given} ${d.given === 1 ? "person has" : "people have"} it`;
  return `${d.loaded} loaded, ${d.given} given${d.kind === "one_each" || !d.reuse ? `, ${d.unused} left` : ""}${d.revoked ? `, ${d.revoked} withdrawn` : ""}${d.replaced ? `, ${d.replaced} replaced` : ""}`;
};
const stateText = (d) => ({ open: "On", stopped: "Stopped", soon: "Not started", closed: "Finished", gone: "Cleared" }[d.state] || d.state);
const isList = (d) => d.kind === "one_each" || d.kind === "random";
const when = (ms) => new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
</script>

<template>
  <section class="stack-3 drops" aria-labelledby="drops-h" data-drops>
    <div class="panel stack-2">
      <h2 id="drops-h">Drops</h2>
      <p class="small muted" style="margin:0">
        Give each person who checked in a key, a code, a password or a food voucher. They open theirs on this event's page in the app, and it is shown only to them.
        You see counts, never what was given.
      </p>
      <p v-if="data && !data.ready" class="notice" role="alert">Drops are switched off on this server, because it has no key to keep them safe with. Nothing can be saved until whoever runs Lanyard sets it up.</p>
    </div>

    <Waiting v-if="loading" shape="panel" :rows="2" label="Loading your drops" :retry="load" />
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <p v-if="notice" class="success-text" role="status">{{ notice }}</p>


    <div v-if="data" class="stack-3">
      <article v-for="d in data.drops" :key="d.id" class="panel stack-2 drop" :data-drop="d.id">
        <div class="spread" style="align-items:flex-start">
          <div style="min-width:0">
            <h3 class="drop-title">{{ d.title }}</h3>
            <span class="small muted">{{ kindLabel(d.kind) }}<template v-if="d.kind === 'voucher'">, {{ d.perPerson }} {{ d.perPerson === 1 ? "use" : "uses" }} each</template><template v-if="d.reuse">, items can repeat</template></span>
          </div>
          <span class="status-pill" :class="d.state">{{ stateText(d) }}</span>
        </div>
        <p class="drop-counts tnum">{{ counts(d) }}</p>
        <div v-if="d.kind === 'voucher' && !d.purged" class="stack-2" data-vstats>
          <div class="v-bar" role="img" :aria-label="`${pct(d.people, d.checkedIn)}% scanned, ${pct(d.opened, d.checkedIn)}% opened`">
            <span class="v-opened" :style="{ width: pct(d.opened, d.checkedIn) + '%' }"></span>
            <span class="v-scanned" :style="{ width: pct(d.people, d.checkedIn) + '%' }"></span>
          </div>
          <dl class="v-figs tnum">
            <div><dt>Checked in</dt><dd>{{ d.checkedIn }}</dd></div>
            <div><dt>Opened it</dt><dd>{{ d.opened }}</dd></div>
            <div><dt>Scanned</dt><dd>{{ d.people }}</dd></div>
            <div><dt>Not yet</dt><dd>{{ Math.max(0, d.checkedIn - d.people) }}</dd></div>
          </dl>
          <p v-if="d.perPerson > 1" class="small muted" style="margin:0">{{ d.used }} of {{ d.entitled }} uses taken.</p>

          <div v-if="linkShown?.dropId === d.id" class="panel stack-2 link-box" role="status" data-scanlink>
            <span class="label">Scanner link for {{ d.title }}</span>
            <input class="link-url" :value="linkShown.url" readonly aria-label="Scanner link" @focus="$event.target.select()" />
            <div class="btn-row wrap">
              <button type="button" class="btn btn-primary" @click="copyLink">{{ copiedLink ? "Copied" : "Copy link" }}</button>
              <button v-if="canShare" type="button" class="btn" @click="shareLink">Share</button>
              <a class="btn" :href="linkShown.url" target="_blank" rel="noopener">Open scanner</a>
            </div>
            <p class="small" style="margin:0">Send this to the staff handing out {{ d.title }}. They open it on a phone and scan each person's QR code. No account needed. {{ windowText(linkShown) }}
              <strong>It is shown once.</strong> If you lose it, make a new one: the old one stops working.</p>
            <button type="button" class="btn" @click="linkShown = null">Done</button>
          </div>
          <p v-else-if="d.scanner" class="small muted" style="margin:0">
            <template v-if="d.scanner.expired">The scanner link has expired.</template>
            <template v-else>A scanner link is out (made {{ when(d.scanner.since) }}). {{ windowText(d.scanner) }}</template>
          </p>
          <p v-else class="small muted" style="margin:0">No scanner link yet. Make one and send it to your staff.</p>
        </div>
        <p v-if="d.note" class="small muted" style="margin:0">{{ d.note }}</p>
        <p v-if="d.validFrom || d.validUntil" class="small muted" style="margin:0">
          <template v-if="d.validFrom">From {{ when(d.validFrom) }}. </template><template v-if="d.validUntil">Until {{ when(d.validUntil) }}.</template>
        </p>
        <p v-if="isList(d) && !d.purged && d.loaded > 0 && d.unused === 0 && d.state === 'open'" class="notice small">All given out. People who open it now are told there are none left.</p>

        <template v-if="!d.purged">
          <div class="btn-row wrap">
            <button v-if="d.status === 'on'" type="button" class="btn" :disabled="!!busy" @click="setStatus(d, 'stopped')">Stop giving</button>
            <button v-else type="button" class="btn" :disabled="!!busy" @click="setStatus(d, 'on')">Start again</button>
            <button v-if="isList(d)" type="button" class="btn" :disabled="!!busy" @click="adding = adding === d.id ? '' : d.id; addText = ''">Add more</button>
            <button v-if="isList(d)" type="button" class="btn" :disabled="!!busy || d.unused === 0" @click="download(d)">Download unused</button>
            <button v-if="d.kind === 'voucher'" type="button" class="btn" :class="{ 'btn-primary': !d.scanner }" :disabled="!!busy" @click="makeLink(d)">
              {{ confirm === d.id + ':link' ? "Tap again: the old link stops working" : d.scanner ? "New scanner link" : "Make scanner link" }}
            </button>
            <button v-if="d.kind === 'voucher' && d.scanner" type="button" class="btn" :disabled="!!busy" @click="stopLink(d)">
              {{ confirm === d.id + ':stoplink' ? "Tap again to stop it" : "Stop scanner link" }}
            </button>
          </div>
          <form v-if="adding === d.id" class="stack-2" @submit.prevent="saveMore(d)">
            <div class="field" style="margin:0">
              <label :for="'more-' + d.id">More items, one on each line</label>
              <textarea :id="'more-' + d.id" v-model="addText" rows="5" spellcheck="false" autocomplete="off" autocapitalize="off" required></textarea>
              <span class="small muted">Anything already in this drop is left out, so no item goes to two people.</span>
            </div>
            <button type="submit" class="btn btn-primary" :disabled="!!busy">{{ busy.endsWith(":add") ? "Adding…" : "Add these" }}</button>
          </form>
          <button v-if="data.named" type="button" class="btn" :aria-expanded="!!who[d.id]" :disabled="!!busy" @click="toggleWho(d)">{{ who[d.id] ? "Hide who has it" : "Who has it" }}</button>
          <div v-if="who[d.id]" class="stack-2 who" data-who>
            <p class="small muted" style="margin:0">Only people who left the list tick on are named. You see which item in your list each one has (its number), never the item itself. "Withdraw and replace" takes it back and gives that person the next unused one; if none are left it changes nothing.</p>
            <ul class="list who-list">
              <li v-for="p in who[d.id].people" :key="p.giveId || p.name" class="list-row who-row">
                <span class="who-name"><strong>{{ p.name }}</strong>
                  <span v-if="d.kind === 'voucher'" class="small muted tnum">{{ p.used }} used, last {{ when(p.lastUsedAt) }}</span>
                  <span v-else class="small muted tnum">Item {{ p.item }}, {{ when(p.givenAt) }}<template v-if="p.withdrawn">, withdrawn</template><template v-else-if="p.replaced">, replaced</template></span>
                </span>
                <span v-if="d.kind !== 'voucher'" class="who-actions">
                  <button v-if="canReplace(d)" type="button" class="btn who-btn" :disabled="!!busy" @click="replace(d, p)">
                    {{ confirm === d.id + ':r' + p.giveId ? "Tap again to replace" : p.withdrawn ? "Give a new one" : "Withdraw and replace" }}
                  </button>
                  <button v-if="!p.withdrawn" type="button" class="btn btn-danger who-btn" :disabled="!!busy" @click="withdraw(d, p)">
                    {{ confirm === d.id + ':w' + p.giveId ? "Tap again" : "Withdraw" }}
                  </button>
                </span>
              </li>
            </ul>
            <p v-if="!who[d.id].people.length" class="empty small" style="margin:0">Nobody on the list has one yet.</p>
            <p v-if="who[d.id].others" class="small muted" style="margin:0">{{ who[d.id].others }} other {{ who[d.id].others === 1 ? "person has" : "people have" }} one but {{ who[d.id].others === 1 ? "is" : "are" }} not on the list, so {{ who[d.id].others === 1 ? "is" : "are" }} not named.</p>
          </div>
          <p v-else-if="!data.named" class="small muted" style="margin:0">Names aren't shown: this event doesn't keep a list of who checked in.</p>
          <div class="btn-row wrap">
            <button v-if="isList(d)" type="button" class="btn btn-danger" :disabled="!!busy || d.unused === 0" @click="delUnused(d)">
              {{ confirm === d.id + ':unused' ? `Tap again: delete ${d.unused} unused` : "Delete unused items" }}
            </button>
            <button type="button" class="btn btn-danger" :disabled="!!busy" @click="delDrop(d)">
              {{ confirm === d.id + ':drop' ? "Tap again: people who have one lose it" : "Delete this drop" }}
            </button>
          </div>
        </template>
      </article>
      <p v-if="!data.drops.length && !loading" class="empty small">No drops yet. Make one below.</p>
    </div>

    <div v-if="data?.ready" class="panel stack-2">
      <button v-if="!opening" type="button" class="btn btn-primary" @click="opening = true">Make a drop</button>
      <form v-else class="stack-2" @submit.prevent="make">
        <h3 class="label" style="margin:0">Make a drop</h3>
        <fieldset class="kinds">
          <legend class="label-top">What are you giving?</legend>
          <label v-for="k in KINDS" :key="k.key" class="checkbox-row field" style="margin:0">
            <input v-model="form.kind" type="radio" name="drop-kind" :value="k.key" />
            <span class="small"><strong>{{ k.label }}</strong><span class="muted" style="display:block">{{ k.help }}</span></span>
          </label>
        </fieldset>
        <div class="field">
          <label for="drop-title">Title</label>
          <input id="drop-title" v-model="form.title" type="text" maxlength="60" autocomplete="off" placeholder="API credit, Wi-Fi password, Lunch" required />
        </div>
        <div class="field">
          <label for="drop-note">A line to show with it (optional)</label>
          <input id="drop-note" v-model="form.note" type="text" maxlength="200" autocomplete="off" placeholder="Paste this into the portal before 5pm" />
        </div>
        <div v-if="listKind" class="field">
          <label for="drop-items">Paste the items, one on each line</label>
          <textarea id="drop-items" v-model="form.items" rows="8" spellcheck="false" autocomplete="off" autocapitalize="off" required></textarea>
          <span class="small muted">Up to 2,000, each up to 600 characters. They are stored scrambled and you can't read them back, except the ones nobody has been given.</span>
        </div>
        <label v-if="form.kind === 'random'" class="checkbox-row">
          <input v-model="form.reuse" type="checkbox" />
          <span class="small">The same item can go to more than one person (each person still gets just one)</span>
        </label>
        <div v-if="form.kind === 'same'" class="field">
          <label for="drop-value">The text everyone gets</label>
          <input id="drop-value" v-model="form.value" type="text" maxlength="600" autocomplete="off" spellcheck="false" required />
        </div>
        <div v-if="form.kind === 'voucher'" class="field">
          <label for="drop-uses">Uses for each person</label>
          <input id="drop-uses" v-model="form.perPerson" type="number" min="1" max="10" inputmode="numeric" required />
          <span class="small muted">For example 1 lunch. Each person's voucher shows a QR code and a 6-digit code. Once it is made, press Make scanner link and send that to your staff.</span>
        </div>
        <div class="field"><label id="drop-from-l">Starts (optional)</label><UiDateTimePicker id="drop-from" v-model="form.validFrom" labelledby="drop-from-l" clearable /></div>
        <div class="field"><label id="drop-until-l">Ends (optional)</label><UiDateTimePicker id="drop-until" v-model="form.validUntil" labelledby="drop-until-l" clearable :min="form.validFrom" /></div>
        <p class="small muted" style="margin:0">Only people who have checked in to this event can open a drop. You can stop it at any time: nothing new is given, and people keep what they already have.</p>
        <div class="btn-row">
          <button type="button" class="btn" @click="opening = false; form = blank()">Cancel</button>
          <button type="submit" class="btn btn-primary" :disabled="!!busy">{{ busy === "make" ? "Saving…" : "Make this drop" }}</button>
        </div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.drop-title { margin: 0; font-size: 18px; overflow-wrap: anywhere; }
.drop-counts { margin: 0; font-size: 20px; font-weight: 700; }
.btn-row.wrap { flex-wrap: wrap; }
.btn-row.wrap .btn { flex: 1 1 140px; }
.kinds { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
.kinds legend { padding: 0; margin-bottom: 8px; }
.status-pill.stopped, .status-pill.closed { color: var(--graphite); }
.link-box { border-color: var(--strap); }
.link-url { width: 100%; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 14px; }
.v-bar { position: relative; height: 10px; border-radius: 5px; background: var(--rule); overflow: hidden; }
.v-bar span { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 5px; }
.v-opened { background: color-mix(in srgb, var(--strap) 35%, var(--rule)); }
.v-scanned { background: var(--strap); }
.v-figs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 0; }
.v-figs > div { min-width: 0; }
.v-figs dt { font-size: 12.5px; color: var(--graphite); }
.v-figs dd { margin: 0; font-size: 20px; font-weight: 700; }
@media (max-width: 420px) { .v-figs { grid-template-columns: repeat(2, 1fr); } }
.who-list { list-style: none; padding: 0; margin: 0; }
.who-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.who-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.who-name { display: flex; flex-direction: column; min-width: 0; }
.who-name strong { overflow-wrap: anywhere; }
.who-btn { flex: none; width: auto; }
</style>
