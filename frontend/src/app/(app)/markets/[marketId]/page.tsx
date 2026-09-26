export default async function MarketPage({ params }: PageProps<"/markets/[marketId]">) {
  const { marketId } = await params;
  return <h1 className="text-2xl font-semibold">Market {marketId}</h1>;
}
