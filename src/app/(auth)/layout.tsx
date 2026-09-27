import { Logo } from "@/components/top-nav";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
      <Logo className="text-2xl" />
      <div className="w-full max-w-sm rounded-[24px] border border-line bg-surface p-7">{children}</div>
    </main>
  );
}
