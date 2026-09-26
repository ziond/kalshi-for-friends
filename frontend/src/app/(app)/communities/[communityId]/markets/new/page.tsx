export default async function NewMarketPage({ params }: PageProps<"/communities/[communityId]/markets/new">) {
  const { communityId } = await params;
  return <h1 className="text-2xl font-semibold">New market in community {communityId}</h1>;
}
