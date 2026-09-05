"use server";

import { cookies } from "next/headers";

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_USER_EMAIL = "planeswalker@magic.io";

export async function getCurrentUserId(): Promise<string> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("mtg_user_id");
  if (sessionCookie && sessionCookie.value) {
    return sessionCookie.value;
  }
  return DEMO_USER_ID;
}

export async function getCurrentUser(): Promise<{ id: string; email: string; name: string }> {
  const cookieStore = await cookies();
  const idCookie = cookieStore.get("mtg_user_id");
  const emailCookie = cookieStore.get("mtg_user_email");

  const id = idCookie?.value || DEMO_USER_ID;
  const email = emailCookie?.value || DEMO_USER_EMAIL;

  return {
    id,
    email,
    name: email.split("@")[0],
  };
}

export async function setDevUserSession(userId: string, email: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set("mtg_user_id", userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  cookieStore.set("mtg_user_email", email, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearUserSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("mtg_user_id");
  cookieStore.delete("mtg_user_email");
}
