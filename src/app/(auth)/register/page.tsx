import { safeNextPath } from "@/lib/auth/redirect";
import { RegisterForm } from "./register-form";

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const { next } = await searchParams;
  return <RegisterForm nextPath={safeNextPath(typeof next === "string" ? next : null)} />;
}
