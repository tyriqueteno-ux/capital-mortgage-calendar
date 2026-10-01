// Sends visitors on any other address (for example a Vercel deployment link)
// to the main site address, so Google sign-in always starts and finishes on
// the same domain.
import { NextResponse } from "next/server";

export function middleware(req) {
  const main = process.env.NEXTAUTH_URL;
  if (!main) return;
  let canonical;
  try { canonical = new URL(main).host; } catch { return; }
  const host = req.headers.get("host") || "";
  if (host && host !== canonical && !host.startsWith("localhost")) {
    return NextResponse.redirect(new URL(req.nextUrl.pathname + req.nextUrl.search, main), 308);
  }
}

export const config = { matcher: "/((?!_next/static|_next/image|favicon.ico).*)" };
