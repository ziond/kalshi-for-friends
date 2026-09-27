import { CreateMarketForm } from "./create-market-form";

export default async function CreateMarketPage({ searchParams }: PageProps<"/markets/new">) {
  const { community } = await searchParams;
  const initialCommunityId = typeof community === "string" ? Number(community) : undefined;

  return (
    <div className="mx-auto flex max-w-[600px] flex-col gap-5 px-4 pt-7 pb-16 sm:px-8">
      <h1 className="text-2xl font-extrabold">Create a market</h1>
      <CreateMarketForm initialCommunityId={initialCommunityId} />
    </div>
  );
}
