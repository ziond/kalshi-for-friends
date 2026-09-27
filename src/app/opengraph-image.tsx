import { OG_SIZE, renderShareCard } from "@/lib/og";

// Default link preview for any page without its own (invites have one).
export const alt = "called it. — prediction markets for your friend group";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return renderShareCard({
    eyebrow: "Friend group forecast",
    title: "Someone's getting exposed today.",
    detail: "Prediction markets for your friend group · Virtual points only",
    cta: "Make your call →",
  });
}
