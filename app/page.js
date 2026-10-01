import Script from "next/script";
import { getSession, memberFor } from "@/lib/auth";
import team from "@/config/team";
import { hoursText } from "@/lib/hours";
import SignIn from "./SignIn";
import Shell from "./Shell";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }) {
  const session = await getSession();
  const email = session?.user?.email;
  if (!session || !memberFor(email) || session.error === "NotOnTeam") {
    return <SignIn company={team.companyName} error={searchParams?.error || (session ? "NotOnTeam" : null)} hours={hoursText()} />;
  }
  const config = {
    company: team.companyName,
    timeZone: team.timeZone,
    hours: team.businessHours,
    hoursText: hoursText(),
    user: { name: session.user.name || email, email },
    needsReauth: session.error === "RefreshFailed",
  };
  return (
    <>
      <Shell company={team.companyName} />
      <script id="cm-config" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(config).replace(/</g, "\\u003c") }} />
      <Script src="/app.js" strategy="afterInteractive" />
    </>
  );
}
