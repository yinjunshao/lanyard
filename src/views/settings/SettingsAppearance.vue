<script setup>
// Appearance and app: the theme, and putting Lanyard on the home screen.
import { ref, onBeforeUnmount } from "vue";
import InstallGuide from "../../components/InstallGuide.vue";
import { getThemePref, setThemePref } from "../../lib/theme";
import { glideSeg } from "../../lib/segGlide";

// F42: the appearance control's bar glides (with the elastic spring) like the host tabs.
let stopGlide = null;
const glide = (el) => { stopGlide?.(); stopGlide = el ? glideSeg(el) : null; };
onBeforeUnmount(() => stopGlide?.());

const themePref = ref(getThemePref());
const THEME_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
function pickTheme(v) {
  themePref.value = v;
  setThemePref(v);
  window.dispatchEvent(new Event("lanyard:theme")); // the list beside this page shows the choice
}
</script>

<template>
  <div class="stack-2">
    <div class="list">
      <div class="list-row spread">
        <span><span class="label">Appearance</span><br />Light or dark</span>
        <div :ref="glide" class="seg" role="group" aria-label="Appearance">
          <button v-for="o in THEME_OPTIONS" :key="o.value" type="button" class="seg-btn"
                  :class="{ on: themePref === o.value }" :aria-pressed="themePref === o.value"
                  @click="pickTheme(o.value)">{{ o.label }}</button>
        </div>
      </div>
    </div>

    <section id="install" class="panel">
      <InstallGuide />
    </section>
  </div>
</template>
