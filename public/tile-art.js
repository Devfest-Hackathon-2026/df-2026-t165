// 選択肢タイルの絵。写真があるものは写真、ないものは伝統色のイラストで描く
const NAVY = "#1c3a6e",
  SHU = "#e0482a",
  YAMABUKI = "#f2a93b",
  ASAGI = "#2a9a9a",
  INK = "#2b2723",
  PAPER = "#fffaf0";

const svg = (bg, body) =>
  `<svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="160" height="120" fill="${bg}"/>${body}</svg>`;
const waves = (y, c, o = 0.25) =>
  `<g fill="none" stroke="${c}" stroke-opacity="${o}" stroke-width="2">${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${i * 32 - 16} ${y}a16 16 0 0 1 32 0M${i * 32 - 10} ${y}a10 10 0 0 1 20 0"/>`).join("")}</g>`;
const lantern = (x, y, s, red = true) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><line x1="0" y1="-14" x2="0" y2="-6" stroke="${INK}" stroke-width="1.5"/><rect x="-10" y="-7" width="20" height="5" rx="1" fill="${INK}"/><ellipse cx="0" cy="18" rx="20" ry="22" fill="${red ? SHU : PAPER}"/><path d="M-18 10Q0 6 18 10M-20 18Q0 14 20 18M-18 26Q0 22 18 26" fill="none" stroke="${red ? "#a8301a" : "#e8d9bf"}"/><rect x="-10" y="38" width="20" height="5" rx="1" fill="${INK}"/></g>`;

const ART = {
  any: svg(
    "#fdf0d6",
    `<circle cx="80" cy="60" r="34" fill="none" stroke="${NAVY}" stroke-width="3"/><path d="M80 30l8 30-8 30-8-30z" fill="${SHU}"/><path d="M80 90l8-30H72z" fill="${NAVY}"/><circle cx="80" cy="60" r="4" fill="${PAPER}"/>`,
  ),
  festival: svg(NAVY, `${waves(118, "#ffffff", 0.18)}<path d="M0 20Q80 46 160 20" fill="none" stroke="${YAMABUKI}" stroke-width="2"/>${lantern(40, 34, 0.9)}${lantern(80, 42, 1)}${lantern(120, 34, 0.9, false)}`),
  food: svg(
    "#fdf0d6",
    `<path d="M20 112h120" stroke="${YAMABUKI}" stroke-width="3"/><path d="M38 60h84a42 42 0 0 1-84 0z" fill="${NAVY}"/><path d="M44 62h72" stroke="${PAPER}" stroke-width="2"/><path d="M58 58q22-34 44 0" fill="${PAPER}"/><path d="M98 34l22-14M100 40l24-12" stroke="${SHU}" stroke-width="3" stroke-linecap="round"/>`,
  ),
  trade: svg(
    "#fbe3dc",
    `<rect x="24" y="40" width="112" height="70" fill="${PAPER}" stroke="${INK}" stroke-width="2"/><path d="M14 42L34 18h92l20 24z" fill="${INK}"/><g fill="${NAVY}"><rect x="34" y="46" width="28" height="38"/><rect x="66" y="46" width="28" height="38"/><rect x="98" y="46" width="28" height="38"/></g><circle cx="80" cy="64" r="9" fill="${PAPER}"/><text x="80" y="69" text-anchor="middle" font-size="12" font-weight="700" fill="${NAVY}" font-family="sans-serif">町</text>`,
  ),
  quiet: svg(
    "#def1ef",
    `<circle cx="116" cy="36" r="16" fill="${YAMABUKI}"/><circle cx="110" cy="31" r="15" fill="#def1ef"/><path d="M0 92h160v28H0z" fill="${ASAGI}" fill-opacity=".35"/><path d="M50 74h44l-6 24H56z" fill="${PAPER}" stroke="${INK}" stroke-width="2"/><path d="M94 80q12 0 8 10" fill="none" stroke="${INK}" stroke-width="2"/><path d="M64 66q4-8 0-14M76 66q4-8 0-14" fill="none" stroke="${ASAGI}" stroke-width="2" stroke-linecap="round"/>`,
  ),
  family: svg(
    "#fbe3dc",
    `<path d="M14 112h132" stroke="${INK}" stroke-width="2"/><path d="M26 112V66l30-24 30 24v46" fill="${PAPER}" stroke="${INK}" stroke-width="2"/><path d="M20 70l36-30 36 30" fill="none" stroke="${SHU}" stroke-width="5" stroke-linejoin="round"/><circle cx="112" cy="70" r="9" fill="${NAVY}"/><path d="M100 112v-22q12-10 24 0v22" fill="${NAVY}"/><circle cx="134" cy="84" r="6" fill="${YAMABUKI}"/><path d="M126 112v-14q8-7 16 0v14" fill="${YAMABUKI}"/>`,
  ),
  names: svg(
    "#e3e9f3",
    `<rect x="72" y="20" width="16" height="94" fill="${INK}"/><path d="M40 30h70l12 12-12 12H40z" fill="${PAPER}" stroke="${NAVY}" stroke-width="2"/><text x="74" y="47" text-anchor="middle" font-size="14" font-weight="700" fill="${NAVY}" font-family="sans-serif">青葉通</text><path d="M120 64H50l-12 12 12 12h70z" fill="${SHU}"/><text x="84" y="81" text-anchor="middle" font-size="13" font-weight="700" fill="${PAPER}" font-family="sans-serif">駅前</text>`,
  ),
  steps: svg(
    "#fdf0d6",
    `<rect x="40" y="16" width="80" height="94" rx="4" fill="${PAPER}" stroke="${INK}" stroke-width="2"/><rect x="34" y="12" width="92" height="10" rx="5" fill="${NAVY}"/><g stroke-width="3" stroke-linecap="round" fill="none"><path d="M52 44l5 5 9-10" stroke="${ASAGI}"/><path d="M52 66l5 5 9-10" stroke="${ASAGI}"/><path d="M52 88h10" stroke="${SHU}"/></g><g stroke="${INK}" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"><path d="M76 45h30M76 67h30M76 89h22"/></g>`,
  ),
  life: svg(
    "#e4e8d8",
    `<circle cx="126" cy="30" r="12" fill="${YAMABUKI}"/><path d="M0 84q40-14 80 0t80 0v36H0z" fill="${ASAGI}" fill-opacity=".45"/><g stroke="#4a6b46" stroke-width="2" stroke-linecap="round">${[18, 34, 50, 66, 82, 98, 114, 130, 146].map((x) => `<path d="M${x} 112v-14M${x} 100l-5-6M${x} 100l5-6"/>`).join("")}</g><path d="M34 62l26-22 26 22z" fill="${INK}"/><rect x="40" y="62" width="40" height="22" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>`,
  ),
  change: svg(
    "#e3e9f3",
    `<path d="M14 112h132" stroke="${INK}" stroke-width="2"/><path d="M22 112V84l18-14 18 14v28z" fill="${PAPER}" stroke="${INK}" stroke-width="2"/><path d="M18 86l22-18 22 18" fill="none" stroke="${SHU}" stroke-width="4"/><rect x="100" y="40" width="40" height="72" fill="${NAVY}"/><g fill="${YAMABUKI}">${[0, 1, 2, 3].map((r) => `<rect x="108" y="${50 + r * 15}" width="8" height="8"/><rect x="124" y="${50 + r * 15}" width="8" height="8"/>`).join("")}</g><path d="M66 66q14-14 28 0" fill="none" stroke="${ASAGI}" stroke-width="3" stroke-linecap="round"/><path d="M90 60l4 6-7 1" fill="none" stroke="${ASAGI}" stroke-width="3" stroke-linecap="round"/>`,
  ),
};
const PHOTO = { sea: "setouchi", mountain: "satoyama", town: "kansai" };

export function tileArt(key) {
  if (PHOTO[key]) return `<img src="images/${PHOTO[key]}.jpg" alt="" loading="lazy">`;
  return ART[key] || ART.any;
}
