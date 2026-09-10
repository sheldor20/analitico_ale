import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const ADMIN_BOOTSTRAP_EVENT = "commercial-admin-bootstrap";
const INITIAL_ADMIN_EMAIL_SHA256 =
  "1eea4fcc8e8eff612238e7db4796a5b456b408c677022de218a41e8b04d94cce";

async function isInitialAdminEmail(email: string) {
  if (!globalThis.crypto?.subtle) return false;
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email.trim().toLowerCase()),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return hex === INITIAL_ADMIN_EMAIL_SHA256;
}

const client = url && key ? createClient(url, key) : null;

if (client) {
  const originalSignInWithPassword = client.auth.signInWithPassword.bind(client.auth);
  client.auth.signInWithPassword = async (credentials) => {
    const result = await originalSignInWithPassword(credentials);
    if (!result.error || !("email" in credentials)) return result;
    if (!(await isInitialAdminEmail(credentials.email))) return result;

    const signup = await client.auth.signUp({
      email: credentials.email,
      password: credentials.password,
    });
    if (signup.error) return result;
    if (signup.data.session) {
      return {
        data: { user: signup.data.user, session: signup.data.session },
        error: null,
      } as Awaited<ReturnType<typeof originalSignInWithPassword>>;
    }

    if (typeof window !== "undefined")
      window.dispatchEvent(new Event(ADMIN_BOOTSTRAP_EVENT));
    return {
      data: { user: null, session: null },
      error: null,
    } as Awaited<ReturnType<typeof originalSignInWithPassword>>;
  };
}

export const supabase = client;
