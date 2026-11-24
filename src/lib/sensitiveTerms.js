// F69: words that can reveal special category data (UK GDPR Article 9), kept out of Who to meet (decision D057).
//
// What it is for: Who to meet (F60, and the older F17 and F25 routes) matches people on what their cards show and on
// what they hope to get from an event, and sends some of that to an AI model. A tag such as a faith society, a health
// group, an LGBTQ+ network, a political society, a union or an ethnic or national-heritage society would otherwise
// become a reason ("Into ...") and reach the model, which is processing special category data for a new purpose.
// So the Worker drops any tag, intention word or headline phrase that contains one of these terms before it scores
// anyone and before it builds what goes to the model, and checks every reason on the way out. The card still shows
// the words where the person put them; only matching and the AI leave them out.
//
// How it matches: whole words, ignoring case and accents, with simple plurals ("churches", "Christians", "societies"),
// and phrases of several words ("christian union", "mental health"). "LGBTQ+" is read as "lgbtq". CamelCase and
// "...soc" run-togethers are split too ("HinduSoc", "ISoc", "LGBTSoc").
//
// What it cannot do: a list cannot catch every phrasing ("Friday prayers group" is caught by "prayer", but a coded
// or misspelt word is not). It is a screen that removes the obvious cases, not a promise. Common words that are
// usually about something else are left out on purpose and listed in the F69 plan note: for example "health" alone
// (health tech, healthcare, public health are industries), "labour" alone (labour law, labour market), "union"
// alone (students' union, Unity), "black" and "asian" alone (black belt, Asian markets), "race" alone, "liberal"
// alone (liberal arts), "cancer" alone (cancer research), "blind", "bi" (business intelligence), "aids", "lent",
// "ministry", "poc" (proof of concept), "theology" (a course), "vegan".
//
// No imports: the Worker and the tests read this file. No page imports it (it is not UI copy).

export const SENSITIVE_TERMS = Object.freeze({
  religion: [
    "religion", "religious", "faith", "interfaith", "multifaith", "spirituality",
    "prayer", "pray", "praying", "worship", "church", "chapel", "mosque", "masjid", "synagogue", "temple", "gurdwara", "mandir",
    "christian", "christianity", "christian union", "christianunion", "catholic", "catholicism", "protestant", "anglican",
    "methodist", "baptist", "pentecostal", "evangelical", "evangelism", "presbyterian", "lutheran", "quaker", "mormon",
    "latter day saints", "jehovah", "coptic", "orthodox christian", "orthodox jewish", "greek orthodox", "russian orthodox",
    "muslim", "islam", "islamic", "isoc", "ahmadiyya", "sunni", "shia", "sufi",
    "jewish", "judaism", "jew", "jsoc", "hindu", "hinduism", "sikh", "sikhism", "buddhist", "buddhism", "jain", "jainism",
    "zoroastrian", "parsi", "bahai", "baha i", "rastafarian", "pagan", "paganism", "wicca", "wiccan",
    "atheist", "atheism", "agnostic", "humanist",
    "bible", "bible study", "quran", "koran", "torah", "talmud", "gospel", "scripture", "jesus", "christ", "allah", "god",
    "halal", "kosher", "ramadan", "iftar", "eid", "diwali", "vaisakhi", "hanukkah", "passover", "yom kippur", "rosh hashanah",
    "priest", "imam", "rabbi", "vicar", "pastor", "chaplain", "chaplaincy", "missionary",
  ],
  health: [
    "mental health", "mental illness", "disability", "disabled", "wheelchair", "wheelchair user",
    "deaf", "hard of hearing", "hearing loss", "visually impaired", "partially sighted", "sight loss",
    "autism", "autistic", "asperger", "aspergers", "adhd", "dyslexia", "dyslexic", "dyspraxia", "dyscalculia",
    "neurodivergent", "neurodiverse", "neurodiversity",
    "depression", "anxiety", "bipolar", "schizophrenia", "ocd", "ptsd", "eating disorder", "anorexia", "bulimia",
    "self harm", "suicide", "chronic illness", "chronically ill", "chronic pain", "long covid", "fibromyalgia", "lupus",
    "crohns", "crohn s", "endometriosis", "pcos", "multiple sclerosis", "epilepsy", "epileptic", "diabetes", "diabetic",
    "cancer survivor", "living with cancer", "hiv", "hiv positive",
    "sober", "sobriety", "addiction", "recovering alcoholic", "alcoholics anonymous",
    "pregnant", "pregnancy", "ivf", "menopause",
  ],
  sexuality: [
    "lgbt", "lgbtq", "lgbtqi", "lgbtqia", "lgbtqiap", "lgb", "lgbtsoc", "lgbtqsoc",
    "queer", "gay", "lesbian", "bisexual", "pansexual", "asexual", "aromantic", "polyamory", "polyamorous",
    "homosexual", "heterosexual", "same sex", "sexuality", "sexual orientation", "sex life", "pride",
    "transgender", "trans", "non binary", "nonbinary", "genderqueer", "genderfluid", "gender fluid",
    "gender non conforming", "intersex", "gender identity",
  ],
  politics: [
    "conservative", "tory", "labour party", "labour society", "labour club", "labour student", "young labour",
    "labour member", "labour councillor", "labour activist", "lib dem", "libdem", "liberal democrat", "young liberal",
    "green party", "young green", "reform uk", "ukip", "snp", "plaid cymru", "sinn fein", "dup", "alliance party",
    "brexit party", "brexiteer", "remainer",
    "socialist", "socialism", "communist", "communism", "marxist", "marxism", "trotskyist", "anarchist", "anarchism",
    "libertarian", "nationalist", "nationalism", "unionist", "republican", "democrat",
    "far right", "far left", "alt right", "left wing", "right wing", "feminist", "feminism",
    "zionist", "zionism", "palestine solidarity", "free palestine", "pro palestine", "pro israel", "friends of israel",
    "extinction rebellion", "just stop oil", "black lives matter", "blm",
    "political party", "party member", "political society", "politics society",
  ],
  tradeUnion: [
    "trade union", "trades union", "trade unionist", "union rep", "union representative", "union member",
    "union membership", "union activist", "shop steward", "unison", "unite union", "unite the union", "gmb", "rmt", "ucu",
    "nasuwt", "national education union", "usdaw", "aslef", "cwu", "pcs union", "tuc", "bectu", "prospect union",
  ],
  ethnicity: [
    "bame", "bme", "bipoc", "ethnic", "ethnicity", "ethnic minority", "racial", "race equality", "racial equality",
    "people of colour", "people of color", "person of colour", "women of colour", "men of colour",
    "mixed race", "biracial", "multiracial", "mixed heritage", "dual heritage", "heritage month", "black history month",
    "indigenous", "aboriginal", "first nations", "black british", "white british", "british asian", "south asian",
    "east asian", "british chinese", "british indian", "british pakistani", "british bangladeshi", "british african",
    "african caribbean", "afro caribbean", "afro", "diaspora", "desi", "latino", "latina", "latinx", "hispanic",
    "gypsy", "romany", "traveller community", "black women", "black men", "black founders", "black professionals",
    "black in tech", "black excellence",
  ],
});

// Ethnic and national-heritage societies by their common words: each of these followed by one of GROUPS
// ("nigerian society", "chinese students", "polish soc", "black network"). Alone, these words are languages, markets
// or places, so they are not screened.
export const HERITAGE = [
  "african", "caribbean", "arab", "asian", "bangladeshi", "black", "brazilian", "chinese", "cypriot", "eritrean",
  "ethiopian", "filipino", "ghanaian", "greek", "hellenic", "hong kong", "indian", "indonesian", "iranian", "persian",
  "irish", "italian", "japanese", "kenyan", "korean", "kurdish", "latin american", "malaysian", "nepalese", "nigerian",
  "pakistani", "polish", "portuguese", "punjabi", "romanian", "singaporean", "somali", "spanish", "sri lankan",
  "sudanese", "tamil", "thai", "turkish", "ugandan", "vietnamese", "zimbabwean", "french", "german",
];
export const GROUPS = ["society", "soc", "network", "association", "community", "student", "diaspora", "heritage"];

/* ---------------------------------- matching ---------------------------------- */

const fold = (w) => (w === "&" ? "and" : w.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase());

// Words of a text with where each one is, in two readings: as typed, and with CamelCase split ("HinduSoc").
function tokens(text) {
  const out = [], camel = [];
  const s = String(text ?? "");
  for (const m of s.matchAll(/[\p{L}\p{N}]+|&/gu)) {
    const at = m.index, w = m[0];
    out.push({ w: fold(w), start: at, end: at + w.length });
    let from = 0;
    const cuts = [...w.matchAll(/(?<=\p{Ll})(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})/gu)].map((c) => c.index);
    for (const cut of [...cuts, w.length]) {
      camel.push({ w: fold(w.slice(from, cut)), start: at + from, end: at + cut });
      from = cut;
    }
  }
  return [out, camel];
}

// A word and its simple plurals: church, churches; christian, christians; society, societies.
const forms = (w) => {
  const f = [w, `${w}s`, `${w}es`];
  if (w.endsWith("y")) f.push(`${w.slice(0, -1)}ies`);
  return f;
};

// Each term as words, indexed by every form its first word may take.
function buildIndex() {
  const all = new Set(Object.values(SENSITIVE_TERMS).flat());
  for (const h of HERITAGE) for (const g of GROUPS) all.add(`${h} ${g}`);
  const index = new Map();
  for (const term of all) {
    const words = tokens(term)[0].map((t) => t.w);
    if (!words.length) continue;
    const firsts = words.length === 1 ? forms(words[0]) : [words[0]];
    for (const f of firsts) {
      if (!index.has(f)) index.set(f, []);
      index.get(f).push(words);
    }
  }
  return index;
}
const INDEX = buildIndex();

// The longest term starting at word i, as the number of words it covers (0 if none).
function termAt(ws, i) {
  let best = 0;
  for (const words of INDEX.get(ws[i].w) || []) {
    const n = words.length;
    if (n <= best || i + n > ws.length) continue;
    let ok = true;
    for (let k = 1; k < n && ok; k++) ok = k === n - 1 ? forms(words[k]).includes(ws[i + k].w) : words[k] === ws[i + k].w;
    if (ok) best = n;
  }
  // "hindusoc", "islamicsoc": a run-together society name.
  const w = ws[i].w;
  if (!best && w.length > 5 && w.endsWith("soc")) {
    const stem = INDEX.get(w.slice(0, -3)) || [];
    if (stem.some((words) => words.length === 1 || (words.length === 2 && words[1] === "soc"))) best = 1;
  }
  return best;
}

function spansIn(ws) {
  const spans = [];
  for (let i = 0; i < ws.length; i++) {
    const n = termAt(ws, i);
    if (n) { spans.push({ start: ws[i].start, end: ws[i + n - 1].end, words: n }); i += n - 1; }
  }
  return spans;
}

/** Where the listed terms are in a text: [{ start, end, words }], in order, not overlapping. */
export function findSensitive(text) {
  const [plain, camel] = tokens(text);
  const spans = [...spansIn(plain), ...spansIn(camel)].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last && s.start < last.end) { if (s.end > last.end) { last.end = s.end; } continue; }
    out.push({ ...s });
  }
  return out;
}

/** True when the text contains any listed term (a tag, an intention, a phrase of a headline, a reason). */
export const isSensitive = (text) => findSensitive(text).length > 0;

/**
 * The text with every listed term taken out (and a "+" straight after it, as in "LGBTQ+"), spaces tidied.
 * Returns { text, words }: `words` is how many words were taken out.
 */
export function stripSensitive(text) {
  const s = String(text ?? "");
  const spans = findSensitive(s);
  if (!spans.length) return { text: s, words: 0 };
  let out = "", at = 0, words = 0;
  for (const sp of spans) {
    let end = sp.end;
    while (s[end] === "+") end++;
    out += s.slice(at, sp.start) + " ";
    at = end;
    words += sp.words;
  }
  out += s.slice(at);
  return { text: out.replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim(), words };
}
