<script setup>
// Aggregate feedback for hosts. The server already hides results under the
// minimum group sizes; this only draws what it was given.
defineProps({ results: { type: Object, required: true } });
const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
const maxOf = (arr) => Math.max(1, ...arr);
</script>

<template>
  <div class="stack-2">
    <p class="small muted" style="margin:0">
      {{ results.responses }} {{ results.responses === 1 ? "response" : "responses" }}.
      Answers are anonymous: they're stored without names, and you see totals once {{ results.minResults }} people
      have answered (written comments from {{ results.minText }}).
    </p>
    <div v-for="q in results.questions" :key="q.id" class="fr-block">
      <span class="label">{{ q.label }}</span>

      <p v-if="q.hidden" class="small muted">Shown once {{ results.minResults }} people have answered.</p>

      <template v-else-if="q.type === 'rating'">
        <p class="fr-avg"><strong class="tnum">{{ q.average ?? "–" }}</strong><span class="small muted"> / 5 average · {{ q.answered }} answered</span></p>
        <div class="bars" role="img" :aria-label="`Ratings: ${q.counts.map((n, i) => `${i + 1} stars ${n}`).join(', ')}`">
          <div v-for="(n, i) in q.counts" :key="i" class="bar-row">
            <span class="small tnum bar-key">{{ i + 1 }}</span>
            <span class="bar"><span class="bar-fill" :style="{ width: (n / maxOf(q.counts)) * 100 + '%' }"></span></span>
            <span class="small tnum bar-n">{{ n }}</span>
          </div>
        </div>
      </template>

      <template v-else-if="q.type === 'text'">
        <p v-if="!q.comments" class="small muted">
          {{ q.answered }} written {{ q.answered === 1 ? "answer" : "answers" }}. Shown once {{ results.minText }} people have responded.
        </p>
        <p v-else-if="!q.comments.length" class="small muted">No written answers.</p>
        <ul v-else class="comments">
          <li v-for="(t, i) in q.comments" :key="i">{{ t }}</li>
        </ul>
      </template>

      <div v-else class="bars">
        <div v-for="o in q.counts" :key="o.option" class="bar-row">
          <span class="small bar-key wide">{{ o.option }}</span>
          <span class="bar"><span class="bar-fill" :style="{ width: pct(o.count, q.answered) + '%' }"></span></span>
          <span class="small tnum bar-n">{{ o.count }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fr-block { display: flex; flex-direction: column; gap: 6px; border-top: var(--border); padding-top: 12px; }
.fr-avg { margin: 0; }
.fr-avg strong { font-size: 26px; }
.bars { display: flex; flex-direction: column; gap: 4px; }
.bar-row { display: grid; grid-template-columns: 24px 1fr 36px; align-items: center; gap: 8px; }
.bar-row:has(.wide) { grid-template-columns: minmax(80px, 34%) 1fr 36px; }
.bar { height: 12px; border-radius: 3px; background: var(--rule); overflow: hidden; }
.bar-fill { display: block; height: 100%; background: var(--ink); }
.bar-n { text-align: right; }
.comments { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
</style>
