/// <reference types="react-dom/canary" />
"use client";

import { useFormState, useFormStatus } from "react-dom";
import { usePathname } from "next/navigation";
import { signIn } from "./signIn";

function SignInButton() {
  const { pending } = useFormStatus();
  return <button className="primary" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>;
}

export default function StudioSignIn() {
  const [state, action] = useFormState(signIn, { error: null });
  const pathname = usePathname();

  return (
    <section className="studio-signin">
      <h1>Studio sign in</h1>
      <form className="form-grid" action={action}>
        <input type="hidden" name="returnPath" value={pathname ?? "/admin"} />
        <label className="form-field">Email<input type="email" name="email" autoComplete="username" required /></label>
        <label className="form-field">Password<input type="password" name="password" autoComplete="current-password" required /></label>
        <SignInButton />
        {state.error ? <p role="alert">{state.error}</p> : null}
      </form>
    </section>
  );
}
