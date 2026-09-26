"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorNote, Field, inputClass } from "@/components/ui";
import { useRegister } from "@/hooks/use-me";

export default function RegisterPage() {
  const router = useRouter();
  const register = useRegister();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        register.mutate({ username, email, password }, { onSuccess: () => router.push("/") });
      }}
    >
      <h1 className="text-xl font-extrabold">Join Huddle</h1>
      <p className="-mt-2 text-[13px] font-semibold text-muted">Everyone starts with 1,000 points.</p>
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
      <Button type="submit" disabled={register.isPending} className="py-3 text-sm font-extrabold">
        {register.isPending ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-[13px] font-semibold text-muted">
        Already have an account? <Link href="/login" className="font-bold text-brand">Log in</Link>
      </p>
    </form>
  );
}
