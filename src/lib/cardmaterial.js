// F56 (D052): the strap materials of a Plus card. Pure data with no imports, read by the Worker (which decides who may
// save one), the card editor (the swatches) and the card image. The drawing itself is CSS: main.css has one `.mat-<id>`
// rule per material with these same colours, and test/materials.mjs checks the two agree and works out the contrast.
//   id     what the Worker keeps in cards.material (exact, lower case)
//   stops  the five tones of the finish, light to dark and back, with the highlight band in the middle (115deg, at 0, 38, 50, 62, 100%)
//   mid    the body tone of the finish, what most of the strap looks like
//   ink    the strap's words: dark on the light metals, white on carbon
//   glint  how much white the moving highlight adds at its brightest (0 to 1); the test counts it in the contrast
export const MATERIALS = [
  { id: "gold", name: "Gold", ink: "#1B1A17", mid: "#D8B04A", glint: 0.22, stops: ["#B38A2A", "#E3C25E", "#F7E6A6", "#D8B04A", "#AE8426"] },
  { id: "silver", name: "Silver", ink: "#1B1A17", mid: "#BCC2C8", glint: 0.22, stops: ["#99A0A8", "#D3D8DD", "#F1F3F5", "#BCC2C8", "#8E959D"] },
  { id: "rose-gold", name: "Rose gold", ink: "#1B1A17", mid: "#D39A88", glint: 0.22, stops: ["#BD806F", "#E3B3A2", "#F6D9CC", "#D39A88", "#B27565"] },
  { id: "copper", name: "Copper", ink: "#1B1A17", mid: "#CF8650", glint: 0.2, stops: ["#C27C48", "#E09B66", "#F2BE94", "#CF8650", "#BD7642"] },
  { id: "pearl", name: "Pearl", ink: "#1B1A17", mid: "#E7E1E8", glint: 0.3, stops: ["#DDD7CE", "#F3EFE8", "#FCFAF6", "#E7E1E8", "#D3CDC6"] },
  { id: "carbon", name: "Carbon", ink: "#FFFFFF", mid: "#1D2125", glint: 0.12, stops: ["#121518", "#262B30", "#343A41", "#1D2125", "#101316"] },
];
export const MATERIAL_IDS = MATERIALS.map((m) => m.id);
// Only the six exact ids: no other case, no spaces, no other type.
export const isMaterial = (v) => typeof v === "string" && MATERIAL_IDS.includes(v);
export const materialOf = (id) => MATERIALS.find((m) => m.id === id) || null;
// The gradient as written in the CSS and drawn on the card image.
export const MATERIAL_AT = [0, 38, 50, 62, 100];
export const gradientOf = (m) => `linear-gradient(115deg, ${m.stops.map((s, i) => `${s} ${MATERIAL_AT[i]}%`).join(", ")})`;
