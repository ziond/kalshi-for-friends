// Link-preview images (Open Graph / Twitter cards), drawn with next/og in the brand style:
// a lime card on the dark background, like the Home hero.

import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

const INK = "#171B19";
const LIME = "#D5FF5F";

interface ShareCardProps {
  /** Small uppercase pill, top right. */
  eyebrow: string;
  /** Line above the title. */
  kicker?: string;
  title: string;
  detail?: string;
  /** Dark button text, bottom left. */
  cta: string;
}

/** Community names can be up to 100 characters; keep the card to two or three lines. */
function fitTitle(title: string) {
  let text = title;
  if (title.length > 60) {
    const cut = title.slice(0, 57);
    text = `${(cut.lastIndexOf(" ") > 30 ? cut.slice(0, cut.lastIndexOf(" ")) : cut).trimEnd()}…`;
  }
  return { text, fontSize: text.length > 40 ? 56 : text.length > 18 ? 68 : 84 };
}

function ShareCard({ eyebrow, kicker, title, detail, cta }: ShareCardProps) {
  const fitted = fitTitle(title);
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: INK, padding: 44 }}>
      <div style={{
        display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1,
        background: LIME, color: INK, borderRadius: 40, padding: "48px 56px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 36, fontWeight: 700 }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center", width: 56, height: 56,
              borderRadius: 14, background: INK, color: LIME, fontSize: 26, fontWeight: 800,
            }}>
              C.
            </div>
            called it.
          </div>
          <div style={{
            display: "flex", padding: "10px 22px", borderRadius: 999, background: "rgba(23,27,25,0.1)",
            color: "#1e6b2f", fontSize: 22, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase",
          }}>
            {eyebrow}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {kicker && <div style={{ display: "flex", fontSize: 34, fontWeight: 600, color: "rgba(23,27,25,0.7)" }}>{kicker}</div>}
          <div style={{
            display: "flex", fontSize: fitted.fontSize, fontWeight: 800, lineHeight: 1.04, letterSpacing: -2,
          }}>
            {fitted.text}
          </div>
          {detail && <div style={{ display: "flex", fontSize: 32, color: "rgba(23,27,25,0.75)" }}>{detail}</div>}
        </div>

        <div style={{ display: "flex" }}>
          <div style={{
            display: "flex", padding: "20px 36px", borderRadius: 24, background: INK, color: LIME,
            fontSize: 30, fontWeight: 700,
          }}>
            {cta}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Inter at one weight, only the glyphs `text` needs (Google Fonts subsetting). */
async function loadInter(weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(
      `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&text=${encodeURIComponent(text)}`,
    )).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null; // offline: fall back to the built-in font
  }
}

export async function renderShareCard(props: ShareCardProps): Promise<ImageResponse> {
  // The eyebrow is drawn in capitals, so the font subset needs those letters too.
  const plain = ["called it.", "C.", "…", ...Object.values(props)].join(" ");
  const text = plain + plain.toUpperCase();
  const weights = [600, 700, 800] as const;
  const loaded = await Promise.all(weights.map((w) => loadInter(w, text)));
  const fonts = weights.flatMap((weight, i) => {
    const data = loaded[i];
    return data ? [{ name: "Inter", data, weight, style: "normal" as const }] : [];
  });

  return new ImageResponse(<ShareCard {...props} />, {
    ...OG_SIZE,
    ...(fonts.length ? { fonts } : {}),
  });
}
