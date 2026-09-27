import { BottomNav, TopNav } from "@/components/top-nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <TopNav />
      <main className="flex-1 pb-24 md:pb-0">{children}</main>
      <BottomNav />
    </>
  );
}
