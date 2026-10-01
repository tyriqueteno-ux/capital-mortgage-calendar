import GoogleProvider from "next-auth/providers/google";
import { getServerSession } from "next-auth";
import team from "../config/team";

const SCOPES = [
  "openid", "email", "profile",
  "https://www.googleapis.com/auth/calendar",   // read calendars, create the Work calendar, manage events
  "https://www.googleapis.com/auth/tasks",      // reminders
].join(" ");

export function memberFor(email) {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return team.members.find(m => m.email.trim().toLowerCase() === e) || null;
}

async function refreshAccessToken(token) {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw data;
    return {
      ...token,
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      refreshToken: data.refresh_token ?? token.refreshToken,
      error: undefined,
    };
  } catch {
    return { ...token, error: "RefreshFailed" };
  }
}

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: { params: { scope: SCOPES, access_type: "offline", prompt: "consent", include_granted_scopes: "true" } },
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/", error: "/" },
  callbacks: {
    // Only people listed in config/team.js can sign in.
    async signIn({ profile, user }) {
      const email = profile?.email || user?.email;
      if (!memberFor(email)) return "/?error=NotOnTeam";
      if (profile && profile.email_verified === false) return "/?error=NotOnTeam";
      return true;
    },
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at ? account.expires_at * 1000 : Date.now() + 3600 * 1000,
        };
      }
      // Removed from the team since signing in: drop access.
      if (!memberFor(token.email)) return { ...token, error: "NotOnTeam" };
      if (Date.now() < (token.expiresAt ?? 0) - 60_000) return token;
      if (!token.refreshToken) return { ...token, error: "RefreshFailed" };
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      const m = memberFor(token.email);
      session.user = { ...session.user, name: m?.name || session.user?.name, role: m?.role || "member" };
      session.error = token.error;
      return session; // access tokens stay server-side, never sent to the browser
    },
  },
};

// For API routes: returns { token, email } or a Response to send back.
export async function requireGoogle(req) {
  const { getToken } = await import("next-auth/jwt");
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !memberFor(token.email)) {
    return { error: Response.json({ error: "signed_out", message: "Sign in again to continue." }, { status: 401 }) };
  }
  if (token.error === "RefreshFailed" || !token.accessToken) {
    return { error: Response.json({ error: "reauth", message: "Your Google connection expired. Sign out and sign back in." }, { status: 401 }) };
  }
  // getToken returns the stored token; refresh here if it has expired
  let t = token;
  if (Date.now() >= (t.expiresAt ?? 0) - 60_000) {
    t = await refreshAccessToken(t);
    if (t.error) return { error: Response.json({ error: "reauth", message: "Your Google connection expired. Sign out and sign back in." }, { status: 401 }) };
  }
  return { accessToken: t.accessToken, email: t.email };
}

export function getSession() {
  return getServerSession(authOptions);
}
