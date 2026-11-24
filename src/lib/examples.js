// F52: the example text that rotates inside an empty text field. General on purpose: students of every
// subject, finance, design, health, law, marketing, research, founders and people in work. No named
// university or society (test/copycheck.mjs), no emoji, UK English. Each line fits its field's maxlength
// (test/examples.mjs). Only the non-public screens import this file.

export const HEADLINE_MAX = 80;
export const WISH_MAX = 120;

export const HEADLINE_EXAMPLES = {
  student: [
    "Second-year economics, into markets and investing",
    "Studying law, interested in tech policy",
    "Nursing student who loves running",
    "Maths student learning to code",
    "Into product design and photography",
    "Medic, interested in health tech",
    "History student and debate team captain",
    "Engineering student building a solar car",
    "Finance and accounting, looking for an internship",
    "Psychology student curious about behaviour",
  ],
  career: [
    "Equity analyst covering European banks",
    "Product designer at a fintech",
    "Marketing lead, growing consumer brands",
    "Software engineer, payments and APIs",
    "Founder building tools for small shops",
    "Recruiter for graduate roles in finance",
    "Data scientist in healthcare",
    "Accountant helping start-ups",
    "Solicitor, employment and start-up law",
    "Researcher in climate and energy",
  ],
};

// "I want to meet someone who..." (event presence; F60 reuses it).
export const WISH_EXAMPLES = [
  "works in finance",
  "is hiring interns",
  "knows about start-ups",
  "is into investing",
  "studies something different from me",
  "works in design",
  "could mentor me",
  "is looking for a co-founder",
  "has moved into a new career",
  "can explain how their job works",
];

export const headlineExamples = (mode) => HEADLINE_EXAMPLES[mode === "career" ? "career" : "student"];

// Link rows: LinkedIn first, Instagram second, then a plain website.
const LINK_PLACEHOLDERS = ["linkedin.com/in/you", "instagram.com/you"];
export const linkPlaceholder = (i) => LINK_PLACEHOLDERS[i] || "yourwebsite.com";
