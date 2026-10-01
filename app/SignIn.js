"use client";
import { signIn } from "next-auth/react";

const MESSAGES = {
  NotOnTeam: "That Google account isn’t on the Capital Mortgage team list. Sign in with your work Google account, or ask VEGA to add you.",
  AccessDenied: "That Google account isn’t on the Capital Mortgage team list. Sign in with your work Google account, or ask VEGA to add you.",
  OAuthCallback: "Google sign-in didn’t finish. Try again.",
  default: "Sign-in didn’t work. Try again.",
};

export default function SignIn({ company, error, hours }) {
  const msg = error ? (MESSAGES[error] || MESSAGES.default) : null;
  return (
    <main className="signin">
      <div className="signin-card">
        <div className="mark" aria-hidden="true">{company.slice(0, 1)}</div>
        <h1>{company} Calendar</h1>
        <p>Your work appointments, reminders and client booking link in one place. Sign in with the Google account your calendar lives in.</p>
        {msg && <p className="err" role="alert">{msg}</p>}
        <button className="gbtn" onClick={() => signIn("google", { callbackUrl: "/" })}>
          <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
          Sign in with Google
        </button>
        <p className="fine">Business hours: {hours}. Only people on the {company} team list can sign in.</p>
      </div>
    </main>
  );
}
