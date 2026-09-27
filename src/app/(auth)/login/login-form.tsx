"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui";
import { useLogin } from "@/hooks/use-me";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        login.mutate({ email, password }, { onSuccess: () => router.push(nextPath) });
      }}
    >
      <h1 className="text-xl font-extrabold">Welcome back</h1>
      <Field label="Email">
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Password">
        <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
      </Field>
      <ErrorNote error={login.error} />
      <Button type="submit" disabled={login.isPending} className="py-3 text-sm font-extrabold">
        {login.isPending ? "Logging in…" : "Log in"}
      </Button>
      <p className="text-center text-[13px] font-semibold text-muted">
        New here? <Link href={nextPath === "/" ? "/register" : `/register?next=${encodeURIComponent(nextPath)}`} className="font-bold text-brand">Create an account</Link>
      </p>
    </form>
  );
}
