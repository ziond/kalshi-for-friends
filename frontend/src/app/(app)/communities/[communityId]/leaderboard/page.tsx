export default async function LeaderboardPage({ params }: PageProps<"/communities/[communityId]/leaderboard">) {
  const { communityId } = await params;
  return <h1 className="text-2xl font-semibold">Leaderboard {communityId}</h1>;
}
