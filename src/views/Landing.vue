<script setup>
import { onMounted, ref, nextTick } from "vue";
import { useRouter } from "vue-router";
import { me, refreshMe } from "../lib/store";
import { drawPass } from "../lib/qr";

const router = useRouter();
const passCanvas = ref(null);

const sample = {
  name: "Yinjun Shao",
  uni: "UCL",
  course: "Technology and Innovation",
  tagline: "Aspiring Entrepreneur in STEM",
  specialties: ["CAD", "ML", "Product Design"],
  helloNote: "We met at the Claude Builders Hackathon!",
  code: "UCL7",
  links: {},
};
// A non-functional, demo-only payload so the sample QR doesn't link anywhere real.
const sampleUrl = "https://lanyard.app/p/sample";

onMounted(async () => {
  if (!me.loaded) {
    try { await refreshMe(); } catch (e) { console.error(e); }
  }
  await nextTick();
  if (passCanvas.value) await drawPass(passCanvas.value, sample, sampleUrl, 2);
});

function start() {
  router.push(me.id ? "/qr" : "/onboard");
}
</script>

<template>
  <div class="landing">
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">lanyard</span>
        <h1 class="hero-title">Meet people like<br />you’ll actually <em>see</em> them again.</h1>
        <p class="hero-lede">
          Don't forget who you've met, follow up before the conversation goes cold.
        </p>
        <div class="hero-cta">
          <button class="btn btn-primary btn-lg" @click="start">Get your QR</button>
          <router-link class="btn btn-ghost btn-lg" to="/scan">Open the scanner</router-link>
        </div>
        <p class="hero-fine">30-second setup · works from any phone camera · no app to install</p>
      </div>

      <div class="hero-pass">
        <div class="pass-frame">
          <canvas ref="passCanvas" aria-label="Example Lanyard pass"></canvas>
        </div>
        <p class="pass-caption">Your pass — downloadable as a phone lock-screen image</p>
      </div>
    </section>

    <section class="principles">
      <article class="principle">
        <span class="principle-num">01</span>
        <h3>Your whole card in one scan</h3>
        <p>Course, societies and every social link — shared in a second, no typing or handle-hunting.</p>
      </article>
      <article class="principle">
        <span class="principle-num">02</span>
        <h3>Remember how you met</h3>
        <p>A hello note travels inside the QR, and you can snap a photo together so the moment sticks.</p>
      </article>
      <article class="principle">
        <span class="principle-num">03</span>
        <h3>Show what you bring</h3>
        <p>Lead with what people can actually come to you for — skills, projects, internships and help.</p>
      </article>
      <article class="principle">
        <span class="principle-num">04</span>
        <h3>Find them everywhere</h3>
        <p>LinkedIn, GitHub, Instagram and more, all on the card — so reconnecting is one tap away.</p>
      </article>
    </section>
  </div>
</template>

<style scoped>
.landing { width: min(1080px, calc(100% - 40px)); margin: 0 auto; padding: 8px 0 40px; }

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(280px, .95fr);
  gap: clamp(30px, 5vw, 56px);
  align-items: center;
  padding: clamp(24px, 5vw, 48px) 0 clamp(34px, 5vw, 54px);
}
.hero-title {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: clamp(40px, 5.2vw, 66px);
  line-height: 1.0;
  letter-spacing: -0.03em;
  margin: 14px 0 18px;
  text-wrap: balance;
}
.hero-title em {
  font-style: normal;
  background: var(--volt);
  box-shadow: 6px 6px 0 var(--ink);
  border: 1px solid var(--ink);
  padding: 0 10px;
  border-radius: 8px;
  white-space: nowrap;
}
.hero-lede {
  font-size: clamp(16px, 1.3vw, 18.5px);
  line-height: 1.55;
  color: var(--ink-soft);
  max-width: 470px;
  margin: 0 0 26px;
}
.hero-cta { display: flex; gap: 12px; flex-wrap: wrap; }
.hero-fine { margin: 16px 0 0; font-size: 13px; color: var(--muted); }

/* exact same pass as /qr */
.hero-pass { justify-self: center; width: 100%; max-width: 340px; }
.pass-frame {
  width: 100%;
  background: var(--paper-2);
  border: 1px solid var(--line);
  border-radius: 26px;
  padding: 16px;
  box-shadow: 10px 10px 0 rgba(14,17,16,.92);
}
.pass-frame canvas { width: 100%; height: auto; display: block; border-radius: 18px; }
.pass-caption { text-align:center; margin:14px 0 0; font-size:12.5px; color:var(--muted); }

/* principles */
.principles {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: 18px;
  overflow: hidden;
  margin-top: 18px;
}
.principle { background: var(--surface); padding: 24px 22px; }
.principle-num { font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--ink); background: var(--volt); border:1px solid var(--ink); border-radius:6px; padding:2px 7px; display:inline-block; letter-spacing: .08em; }
.principle h3 { font-family: var(--font-display); font-weight: 600; font-size: 20px; line-height: 1.15; letter-spacing: -.01em; margin: 12px 0 8px; }
.principle p { margin: 0; font-size: 14px; line-height: 1.5; color: var(--ink-soft); }

@media (max-width: 900px) {
  .hero { grid-template-columns: 1fr; gap: 38px; }
  .hero-pass { order: -1; max-width: 300px; }
  .principles { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 520px) {
  .principles { grid-template-columns: 1fr; }
}
</style>
