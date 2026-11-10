<script setup>
// Step 4: links, all optional. Paste an address and its label is filled in.
import { ref } from "vue";
import { Api } from "../../lib/api";
import { me, refreshMe } from "../../lib/store";
import { buildLinks, labelForUrl } from "../../lib/links";

const MAX_LINKS = 20;
const have = Object.entries(me.profile?.links || {}).map(([label, url]) => ({ label, url, auto: "" }));
const rows = ref(have.length ? have : [{ label: "", url: "", auto: "" }, { label: "", url: "", auto: "" }]);

// Fill the label from the address, unless they have typed a label of their own.
function onUrl(row) {
  const guess = labelForUrl(row.url);
  if (!row.label || row.label === row.auto) { row.label = guess; row.auto = guess; }
}
const add = () => { if (rows.value.length < MAX_LINKS) rows.value.push({ label: "", url: "", auto: "" }); };
function remove(i) {
  rows.value.splice(i, 1);
  if (!rows.value.length) add();
}

async function save() {
  await Api.updateProfile({ links: buildLinks(rows.value) });
  await refreshMe();
}
defineExpose({ ready: true, save });
</script>

<template>
  <div class="stack-2">
    <h1>Add your links</h1>
    <p class="muted" style="margin:0">LinkedIn, GitHub, a portfolio. People tap them straight from your card. You can skip this.</p>
    <div id="links" class="field" style="margin-bottom:0">
      <div v-for="(l, i) in rows" :key="i" class="link-row">
        <input v-model="l.label" type="text" maxlength="40" placeholder="Label" :aria-label="`Link ${i + 1} label`" />
        <input v-model="l.url" type="url" inputmode="url" placeholder="linkedin.com/in/you" :aria-label="`Link ${i + 1} address`"
               autocapitalize="none" spellcheck="false" @input="onUrl(l)" />
        <button type="button" class="link-remove" :aria-label="`Remove link ${i + 1}`" @click="remove(i)">×</button>
      </div>
      <button type="button" class="btn" :disabled="rows.length >= MAX_LINKS" @click="add">Add another link</button>
    </div>
  </div>
</template>
