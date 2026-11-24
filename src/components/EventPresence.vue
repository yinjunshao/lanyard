<script setup>
// F17, changed by F60: "Be easy to find" on the event hub while the event is on. Off until you turn it on. Since F60
// it is the opt-in for one thing only: a face photo beside your entry in other people's Who to meet (D054), so they
// can spot you in the room. Who to meet itself, its list and its intention field are EventWhoToMeet.vue. A line you
// wrote here before F60 is kept until you turn this off or 48 hours after the event, then deleted.
import { explain } from "../lib/errors";
import { computed, onMounted, ref, watch } from "vue";
import { api } from "../lib/api";
import { fileToDataUrl } from "../lib/photo";
import Avatar from "./Avatar.vue";

const props = defineProps({ eventId: { type: String, required: true }, status: { type: String, default: "ongoing" } });

const me = ref(null); // { available, why, on, intro, lookingFor, selfie }
const busy = ref(false);
const error = ref("");
const note = ref("");

const over = computed(() => props.status === "ended" || me.value?.why === "not_ongoing");
const usable = computed(() => !!me.value && me.value.available && !over.value);
// Nothing to show when the host has the room off, or when it is over and you never turned it on.
const show = computed(() => !!me.value && me.value.why !== "directory_off" && (usable.value || (over.value && me.value.on)));

onMounted(load);
watch(() => props.eventId, load);
async function load() {
  me.value = null; error.value = ""; note.value = "";
  try { me.value = await api(`/api/e/${encodeURIComponent(props.eventId)}/presence`); }
  catch { /* not checked in, or no signal: the card simply does not show */ }
}

async function change(body, done = "Saved.") {
  busy.value = true; error.value = ""; note.value = "";
  try {
    me.value = await api(`/api/e/${encodeURIComponent(props.eventId)}/presence`, "PUT", body);
    note.value = done;
    return true;
  } catch (e) { error.value = e.message; return false; }
  finally { busy.value = false; }
}

async function toggle(e) {
  const on = e.target.checked;
  if (on) {
    // Ticking the box is the consent: the card above says exactly what is shown and to whom.
    if (!(await change({ consent: true }, "You're easy to find now. Add a selfie so people can spot you."))) e.target.checked = false;
  } else {
    busy.value = true; error.value = ""; note.value = "";
    try {
      await api(`/api/e/${encodeURIComponent(props.eventId)}/presence`, "DELETE");
      me.value = { ...me.value, on: false, intro: "", lookingFor: "", selfie: null };
      note.value = "Done. Your photo and line are deleted.";
    } catch (err) { error.value = err.message; e.target.checked = true; }
    finally { busy.value = false; }
  }
}

async function takeSelfie(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  busy.value = true; error.value = "";
  try {
    const dataUrl = await fileToDataUrl(file, 720, 0.8);
    // Choosing a photo here is the consent to it being shown, as the text beside the button says.
    await change({ consent: true, selfieDataUrl: dataUrl }, "Photo saved.");
  } catch (err) { error.value = explain(err, "That photo couldn't be read. Try another."); busy.value = false; }
}
const removeSelfie = () => change({ selfieDataUrl: null }, "Photo deleted.");
const withdrawNow = async () => {
  busy.value = true;
  try {
    await api(`/api/e/${encodeURIComponent(props.eventId)}/presence`, "DELETE");
    me.value = { ...me.value, on: false, selfie: null, intro: "", lookingFor: "" };
    note.value = "Done. Your photo and line are deleted.";
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
};
</script>

<template>
  <section v-if="show" class="stack" aria-labelledby="presence-h">
    <!-- The event is over: say what happens to what you showed, and let them delete it now. -->
    <div v-if="over" class="panel stack">
      <h2 id="presence-h" class="label">Be easy to find</h2>
      <p class="small">This event has ended, so nobody can see your photo or line any more. They are deleted within 48 hours of the end, or now if you press the button.</p>
      <button type="button" class="btn" :disabled="busy" @click="withdrawNow">Delete my photo and line now</button>
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <p v-if="note" class="success-text" role="status">{{ note }}</p>
    </div>

    <div v-else class="panel stack">
      <h2 id="presence-h" class="label">Be easy to find</h2>
      <p class="small">Add a photo of yourself to your entry in Who to meet, so people here can spot you in the room.</p>
      <ul class="small presence-facts">
        <li><strong>Who sees it:</strong> only people checked in to this event who are shown you in Who to meet, and only while the event is on.</li>
        <li><strong>What they see:</strong> your photo, beside your first name and last initial, headline, tags and what you hope to get from the event. Not your card, links or contact details. The organiser only sees how many people used this.</li>
        <li><strong>When it is deleted:</strong> as soon as you turn it off, and 48 hours after the event ends at the latest.</li>
      </ul>
      <label class="checkbox-row">
        <input type="checkbox" :checked="me.on" :disabled="busy" @change="toggle" />
        <span><strong>Show my photo to people here</strong></span>
      </label>

      <template v-if="me.on">
        <div class="presence-me">
          <Avatar class="presence-me-photo" :src="me.selfie" alt="Your photo" />
          <div class="stack presence-me-actions">
            <label for="presence-selfie" class="btn" :class="{ 'btn-disabled': busy }">{{ me.selfie ? "Retake selfie" : "Take a selfie" }}</label>
            <input id="presence-selfie" class="visually-hidden" type="file" accept="image/*" capture="user" :disabled="busy" @change="takeSelfie" />
            <button v-if="me.selfie" type="button" class="btn-quiet" :disabled="busy" @click="removeSelfie">Delete photo</button>
          </div>
        </div>
        <p class="small muted">Taking a selfie means you're happy for the people described above to see it.</p>
      </template>

      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <p v-if="note" class="success-text" role="status">{{ note }}</p>
    </div>
  </section>
</template>

<style scoped>
.presence-facts { margin: 0; padding-left: 18px; }
.presence-facts li + li { margin-top: 6px; }
.presence-me { display: flex; gap: 14px; align-items: center; }
.presence-me-photo { width: 96px; height: 96px; border-radius: var(--radius); object-fit: cover; flex: none; border: var(--border); }
.presence-me-actions { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space); }
.presence-me-actions > * + * { margin-top: 0; }
label.btn { display: inline-flex; align-items: center; justify-content: center; cursor: pointer; width: auto; }
.btn-disabled { opacity: 0.4; pointer-events: none; }
#presence-selfie:focus-visible + .btn, label.btn:focus-within { outline: 2.5px solid var(--strap); outline-offset: 2px; }
</style>
