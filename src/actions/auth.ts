"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_USER_EMAIL = "planeswalker@magic.io";

export interface UserSessionState {
  id: string;
  email: string;
  name: string;
  isAuthenticated: boolean;
}

/**
 * Returns the current authenticated user's ID from Supabase Auth.
 * Falls back to demo user ID only if offline / dev fallback is needed.
 */
export async function getCurrentUserId(): Promise<string> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && user.id) {
      return user.id;
    }
  } catch (error) {
    console.warn("Could not retrieve Supabase user:", error);
  }

  return process.env.DEV_USER_ID || DEMO_USER_ID;
}

/**
 * Returns user details and authentication status.
 */
export async function getCurrentUser(): Promise<UserSessionState> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && user.id) {
      const email = user.email || "";
      return {
        id: user.id,
        email,
        name: email.split("@")[0] || "Planeswalker",
        isAuthenticated: true,
      };
    }
  } catch (error) {
    console.warn("Could not retrieve Supabase user:", error);
  }

  return {
    id: DEMO_USER_ID,
    email: DEMO_USER_EMAIL,
    name: "Invitado",
    isAuthenticated: false,
  };
}

/**
 * Logs in with Email and Password using Supabase Auth.
 */
export async function signInWithEmail(email: string, password: string): Promise<{ error?: string }> {
  if (!email || !password) {
    return { error: "Debes ingresar tu correo y contraseña." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      return { error: error.message };
    }

    revalidatePath("/", "layout");
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Error inesperado al iniciar sesión." };
  }
}

/**
 * Registers a new user with Email and Password in Supabase Auth.
 */
export async function signUpWithEmail(
  email: string,
  password: string
): Promise<{ error?: string; needsConfirmation?: boolean }> {
  if (!email || !password) {
    return { error: "Debes ingresar tu correo y contraseña." };
  }

  if (password.length < 6) {
    return { error: "La contraseña debe tener al menos 6 caracteres." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    if (error) {
      return { error: error.message };
    }

    // If Supabase has "Confirm email" enabled and no session was returned
    if (data.user && !data.session) {
      return { needsConfirmation: true };
    }

    revalidatePath("/", "layout");
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Error inesperado al registrar usuario." };
  }
}

/**
 * Signs out the current user and clears session cookies.
 */
export async function signOutUser() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
