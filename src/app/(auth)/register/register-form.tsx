"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui";
import { replacePage } from "@/lib/auth/navigate";
import { useRegister } from "@/hooks/use-me";

export function RegisterForm({ nextPath }: { nextPath: string }) {
  const register = useRegister();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        register.mutate({ username, email, password }, { onSuccess: () => replacePage(nextPath) });
      }}
    >
      <h1 className="text-2xl font-bold tracking-tight">Join called it.</h1>
      <p className="-mt-2 text-sm text-muted">Everyone starts with 1,000 points, plus 1,000 more every day.</p>
      <Field label="Username">
        <input required maxLength={50} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Email">
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Password">
        <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
      </Field>
      <ErrorNote error={register.error} />
      <Button type="submit" disabled={register.isPending} className="rounded-2xl py-3.5 text-[15px]">
        {register.isPending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-[13px] text-muted">
        Already have an account? <Link href={nextPath === "/" ? "/login" : `/login?next=${encodeURIComponent(nextPath)}`} className="font-semibold text-lime hover:text-lime-hover">Log in</Link>
      </p>
    </form>
  );
}
