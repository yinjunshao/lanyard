<script setup>
// Appearance and app: the theme, and putting Lanyard on the home screen.
import { ref, onBeforeUnmount } from "vue";
import InstallGuide from "../../components/InstallGuide.vue";
import { getDarkKind, getThemePref, setDarkKind, setThemePref } from "../../lib/theme";
import { glideSeg } from "../../lib/segGlide";

// F42: the appearance control's bar glides (with the elastic spring) like the host tabs.
let stopGlide = null;
const glide = (el) => { stopGlide?.(); stopGlide = el ? glideSeg(el) : null; };
let stopGlide2 = null;
const glide2 = (el) => { stopGlide2?.(); stopGlide2 = el ? glideSeg(el) : null; };
onBeforeUnmount(() => stopGlide?.());
onBeforeUnmount(() => stopGlide2?.());

const themePref = ref(getThemePref());
const THEME_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "midnight", label: "Midnight" },
];
// F54: with Auto, what to wear when the device is dark.
const darkKind = ref(getDarkKind());
const DARK_OPTIONS = [{ value: "dark", label: "Dark" }, { value: "midnight", label: "Midnight" }];
function pickDarkKind(v) { darkKind.value = v; setDarkKind(v); }
function pickTheme(v) {
  themePref.value = v;
  setThemePref(v);
  window.dispatchEvent(new Event("lanyard:theme")); // the list beside this page shows the choice
}
</script>

<template>
  <div class="stack-2">
    <div class="list">
      <div class="list-row spread" style="flex-wrap:wrap">
        <span><span class="label">Appearance</span><br />Light, dark or pure black</span>
        <div :ref="glide" class="seg" role="group" aria-label="Appearance">
          <button v-for="o in THEME_OPTIONS" :key="o.value" type="button" class="seg-btn"
                  :class="{ on: themePref === o.value }" :aria-pressed="themePref === o.value"
                  @click="pickTheme(o.value)">{{ o.label }}</button>
        </div>
      </div>
      <div v-if="themePref === 'auto'" class="list-row spread" style="flex-wrap:wrap">
        <span><span class="label">When my device is dark</span><br />Use</span>
        <div :ref="glide2" class="seg" role="group" aria-label="When my device is dark, use">
          <button v-for="o in DARK_OPTIONS" :key="o.value" type="button" class="seg-btn"
                  :class="{ on: darkKind === o.value }" :aria-pressed="darkKind === o.value"
                  @click="pickDarkKind(o.value)">{{ o.label }}</button>
        </div>
      </div>
    </div>

    <section id="install" class="panel">
      <InstallGuide />
    </section>
  </div>
</template>
