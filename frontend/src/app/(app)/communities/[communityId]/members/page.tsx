export default async function MembersPage({ params }: PageProps<"/communities/[communityId]/members">) {
  const { communityId } = await params;
  return <h1 className="text-2xl font-semibold">Members {communityId}</h1>;
}
