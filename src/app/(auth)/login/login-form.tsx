"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui";
import { replacePage } from "@/lib/auth/navigate";
import { useLogin } from "@/hooks/use-me";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        login.mutate({ email, password }, { onSuccess: () => replacePage(nextPath) });
      }}
    >
      <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
      <Field label="Email">
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Password">
        <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
      </Field>
      <ErrorNote error={login.error} />
      <Button type="submit" disabled={login.isPending} className="rounded-2xl py-3.5 text-[15px]">
        {login.isPending ? "Logging in…" : "Log in"}
      </Button>
      <p className="text-center text-[13px] text-muted">
        New here? <Link href={nextPath === "/" ? "/register" : `/register?next=${encodeURIComponent(nextPath)}`} className="font-semibold text-lime hover:text-lime-hover">Create an account</Link>
      </p>
    </form>
  );
}
