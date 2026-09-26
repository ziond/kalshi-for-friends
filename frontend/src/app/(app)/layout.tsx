import { TopNav } from "@/components/top-nav";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <TopNav />
      <main className="flex-1">{children}</main>
    </>
  );
}
