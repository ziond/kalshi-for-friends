import { SparkleIcon } from "./icons";

/** Lime "YOU LITERALLY CALLED IT." card for a prediction that won. Doubles as a shareable result card. */
export function WinningCard({ question, prediction, points }: { question: string; prediction: string; points: number }) {
  return (
    <section aria-label="You called it" className="rounded-[26px] bg-lime p-6 text-on-lime sm:p-7">
      <div className="flex items-center justify-between border-b border-on-lime/15 pb-5">
        <span className="text-xl font-bold tracking-tight">called it.</span>
        <SparkleIcon size={24} />
      </div>
      <div className="mt-5 text-xs font-semibold tracking-[0.08em] text-on-lime/70 uppercase">Prediction resolved</div>
      <div className="mt-3 text-[32px] leading-[1.05] font-extrabold tracking-tight uppercase sm:text-[40px]">
        You literally called it.
      </div>
      <p className="mt-3 text-[15px] text-on-lime/80">{question}</p>
      <div className="mt-4 rounded-[18px] bg-canvas p-5 text-ink">
        <div className="text-xs font-medium tracking-[0.08em] text-muted uppercase">Your prediction</div>
        <div className="mt-2 flex items-center gap-2 text-[32px] leading-none font-extrabold text-lime uppercase">
          {prediction} <span aria-hidden>✓</span>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
          <span className="text-xl font-bold">+{points.toLocaleString()} points</span>
          <span className="rounded-full bg-live/15 px-3 py-1 text-xs font-semibold tracking-[0.06em] text-live uppercase">
            Winner
          </span>
        </div>
      </div>
      <p className="mt-4 text-[15px] text-on-lime/80">The group doubted you. The receipts didn&apos;t.</p>
    </section>
  );
}
