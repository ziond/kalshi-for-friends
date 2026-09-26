import { safeNextPath } from "@/lib/auth/redirect";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return <LoginForm nextPath={safeNextPath(typeof next === "string" ? next : null)} />;
}
