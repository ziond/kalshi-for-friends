export default async function CommunityPage({ params }: PageProps<"/communities/[communityId]">) {
  const { communityId } = await params;
  return <h1 className="text-2xl font-semibold">Community {communityId}</h1>;
}
