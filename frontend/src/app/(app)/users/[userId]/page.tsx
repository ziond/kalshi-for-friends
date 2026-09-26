export default async function UserPage({ params }: PageProps<"/users/[userId]">) {
  const { userId } = await params;
  return <h1 className="text-2xl font-semibold">User {userId}</h1>;
}
