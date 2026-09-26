import Link from "next/link";

const NAV = [
  { href: "/", label: "Feed" },
  { href: "/communities", label: "Communities" },
  { href: "/portfolio", label: "Positions" },
  { href: "/wallet", label: "Wallet" },
] as const;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b px-4 py-3">
        <nav className="mx-auto flex max-w-5xl gap-4">
          {NAV.map(({ href, label }) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4">{children}</main>
    </>
  );
}
