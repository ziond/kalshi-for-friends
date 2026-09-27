import { Logo } from "@/components/top-nav";

// Invite links are opened by people who may not have an account yet, and by link-preview bots,
// so this route sits outside the signed-in app shell (no nav, no /me call).
export default function InviteLayout({ children }: LayoutProps<"/invite/[code]">) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
      <Logo className="text-2xl" />
      {children}
    </main>
  );
}
