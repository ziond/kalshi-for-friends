import { CreateMarketForm } from "./create-market-form";

export default async function CreateMarketPage({ searchParams }: PageProps<"/markets/new">) {
  const { community } = await searchParams;
  const initialCommunityId = typeof community === "string" ? Number(community) : undefined;

  return (
    <div className="mx-auto flex max-w-[600px] flex-col gap-5 px-4 pt-7 pb-16 sm:px-6">
      <header>
        <h1 className="text-[32px] leading-tight font-bold tracking-tight">Create a market</h1>
        <p className="mt-1 text-[15px] text-muted">Got a hot take? Turn it into a prediction.</p>
      </header>
      <CreateMarketForm initialCommunityId={initialCommunityId} />
    </div>
  );
}
