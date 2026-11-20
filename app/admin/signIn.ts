"use server";

import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type SignInState = { error: string | null };

export async function signIn(_previous: SignInState, form: FormData): Promise<SignInState> {
  const email = form.get("email");
  const password = form.get("password");
  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
    return { error: "Enter your email and password." };
  }

  try {
    const supabase = createServerActionClient({ cookies });
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return { error: "Couldn’t sign in. Check your email and password and try again." };
  } catch {
    return { error: "Couldn’t reach the sign-in service. Try again." };
  }

  const returnPath = form.get("returnPath");
  redirect(typeof returnPath === "string" && /^\/admin(?:\/[a-zA-Z0-9_-]+)?$/.test(returnPath) ? returnPath : "/admin");
}
