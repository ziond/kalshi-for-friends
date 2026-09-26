import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
      <Link href="/" className="flex items-center gap-2 text-[22px] font-extrabold tracking-tight">
        <span className="flex size-7 items-center justify-center rounded-lg bg-brand text-[15px] text-white">H</span>
        Huddle
      </Link>
      <div className="w-full max-w-sm rounded-[20px] border border-line bg-white p-7">{children}</div>
    </main>
  );
}
