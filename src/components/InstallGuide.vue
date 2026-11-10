<script>
// Should the "add to home screen" panel show? On a phone only, and only once: never again after
// "Not now" or "I've added it", once this account has opened Lanyard from a home-screen icon, or
// when Android reports it's installed. (On a computer it's just in Settings.) Shared by My card and
// the welcome steps; this file already loads wherever the panel shows, so it adds no chunk.
import { platform, installDismissed, installedHere, relatedAppInstalled, isStandalone } from "../lib/install";

export async function offerInstall(user) {
  if (isStandalone() || platform() === "desktop" || installDismissed() || installedHere() || user?.appInstalled) return false;
  return !(await relatedAppInstalled());
}
</script>

<script setup>
// How to put Lanyard on your home screen, for the phone you're holding.
import { computed } from "vue";
import { platform, iosSafariVersion, installPrompt, promptInstall, isStandalone, markInstalledHere } from "../lib/install";

defineProps({ heading: { type: String, default: "Add Lanyard to your home screen" } });
const emit = defineEmits(["done"]);

const kind = platform();
const newSafari = iosSafariVersion() >= 26;
const installed = isStandalone();
const host = location.host;
const canPrompt = computed(() => !!installPrompt.value);
async function install() {
  if (await promptInstall()) { markInstalledHere(); emit("done"); }
}
// iPhone can't tell a web page it's been added, so ask once.
function added() { markInstalledHere(); emit("done"); }
</script>

<template>
  <div class="stack-2 install-guide">
    <strong>{{ heading }}</strong>
    <p v-if="installed" class="small muted" style="margin:0">You're already using Lanyard from your home screen.</p>

    <template v-else-if="kind === 'ios-safari'">
      <p class="small muted" style="margin:0">It opens straight to your card, full screen, with no browser bars. No App Store needed.</p>
      <ol class="small install-steps">
        <li v-if="newSafari">Tap <strong>•••</strong> next to the address bar, then tap <strong>Share</strong>.</li>
        <li v-else>Tap the <strong>Share</strong> button <span aria-hidden="true" class="share-glyph">⬆︎</span> at the bottom of the screen.</li>
        <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
        <li v-if="newSafari">Leave <strong>Open as Web App</strong> turned on.</li>
        <li>Tap <strong>Add</strong>. Lanyard is now on your home screen.</li>
      </ol>
      <p class="small muted" style="margin:0">Can't see it? Make sure you opened this page in Safari, not inside Instagram or another app.</p>
      <button type="button" class="btn" @click="added">I've added it</button>
    </template>

    <template v-else-if="kind === 'ios-other'">
      <ol class="small install-steps">
        <li>Tap the <strong>Share</strong> button <span aria-hidden="true" class="share-glyph">⬆︎</span> in the address bar.</li>
        <li>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
      </ol>
      <p class="small muted" style="margin:0">If you don't see that option, open this page in Safari and do it from there.</p>
      <button type="button" class="btn" @click="added">I've added it</button>
    </template>

    <template v-else>
      <button v-if="canPrompt" type="button" class="btn btn-primary" @click="install">Install Lanyard</button>
      <template v-else-if="kind === 'android'">
        <ol class="small install-steps">
          <li>Tap the <strong>⋮</strong> menu in Chrome.</li>
          <li>Tap <strong>Add to Home screen</strong> (or <strong>Install app</strong>), then <strong>Install</strong>.</li>
        </ol>
        <button type="button" class="btn" @click="added">I've added it</button>
      </template>
      <p v-else class="small muted" style="margin:0">
        On your phone, open {{ host }} and use your browser's <strong>Add to Home Screen</strong> option.
        In Chrome or Edge on a computer, use the install icon in the address bar.
      </p>
    </template>
  </div>
</template>

<style scoped>
.install-steps { margin: 0; padding-left: 20px; display: grid; gap: 6px; }
.share-glyph { display: inline-block; font-weight: 700; }
</style>
