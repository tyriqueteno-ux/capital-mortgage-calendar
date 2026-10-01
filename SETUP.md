# Capital Mortgage Calendar — setup guide

This is a private website for the Capital Mortgage team. Each person signs in with their own Google account and sees their own **Work** calendar, reminders and client booking link. Business hours (Mon–Sat, 8 AM – 6 PM Central) are enforced on the server, so nobody can save an appointment outside them from this site.

Nobody needs a Claude account to use it. Changes to the site come from Claude: you send the updated files to GitHub and the site redeploys on its own.

**Redeploying never touches anyone's calendar.** Meetings, invites and booking pages live in each person's Google account. The site only reads and writes them there, so a new version of the site leaves every existing meeting exactly as it was.

Setup takes about 30–45 minutes, once. You need three free accounts: **Google Cloud**, **GitHub** and **Vercel**.

---

## Part 1 — Google Cloud (lets the site talk to Google Calendar)

1. Go to **console.cloud.google.com** and sign in with your Google account.
2. At the top, click the project picker → **New project**. Name it `Capital Mortgage Calendar` and click **Create**. Make sure the new project is selected.
3. Turn on the two Google services the site uses:
   - Search the top bar for **Google Calendar API**, open it, click **Enable**.
   - Search for **Google Tasks API**, open it, click **Enable**.
4. Set up the sign-in screen. Go to **Google Auth Platform** (or **APIs & Services → OAuth consent screen**) and click **Get started**:
   - **App name:** Capital Mortgage Calendar
   - **User support email:** your email
   - **Audience:** **External**. If everyone on your team uses Google Workspace accounts on the same company domain, choose **Internal** instead. That skips the warning screen described in step 7.
   - **Contact email:** your email → **Create**.
5. Go to **Data access** → **Add or remove scopes**. Add these two, then click **Update** and **Save**:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/tasks`
6. Go to **Clients** → **Create client**:
   - **Application type:** Web application
   - **Name:** Capital Mortgage Calendar
   - Leave **Authorized redirect URIs** empty for now. You'll add it in Part 3.
   - Click **Create**, then copy the **Client ID** and **Client secret** somewhere safe.
7. Go to **Audience** and click **Publish app** → **Confirm** (status becomes **In production**).
   - Why: in "Testing" mode Google signs everyone out every 7 days.
   - What your team will see: the first time each person signs in, Google says the app **isn't verified**. They click **Advanced → Go to Capital Mortgage Calendar**. That's expected for a private team app. Up to 100 people can sign in this way.

## Part 2 — GitHub (holds the site's code)

1. Create a free account at **github.com** if you don't have one.
2. Click **+** → **New repository**. Name it `capital-mortgage-calendar`, choose **Private**, and click **Create repository**.
3. On the new repository page, click **uploading an existing file**.
4. Unzip `capital-mortgage-calendar.zip` on your computer. Open the folder, select **everything inside it**, and drag it onto the GitHub page. The folders are `app`, `config`, `lib`, `public` and the files next to them.
5. Click **Commit changes**.

## Part 3 — Vercel (puts the site online)

1. Go to **vercel.com** and sign up with **Continue with GitHub**.
2. Click **Add New… → Project**, find `capital-mortgage-calendar`, and click **Import**.
3. Open **Environment Variables** and add these four:

   | Name | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | the Client ID from Part 1 |
   | `GOOGLE_CLIENT_SECRET` | the Client secret from Part 1 |
   | `NEXTAUTH_SECRET` | a long random string; get one at generate-secret.vercel.app/32 |
   | `NEXTAUTH_URL` | leave as `https://example.com` for now |

4. Click **Deploy**. When it finishes, Vercel shows your site address, something like `https://capital-mortgage-calendar.vercel.app`.
5. Finish the connection:
   - In Vercel: **Settings → Environment Variables** → edit `NEXTAUTH_URL` to your real address (no slash at the end).
   - In Google Cloud: **Clients** → your client → **Authorized redirect URIs** → **Add URI** →
     `https://YOUR-ADDRESS/api/auth/callback/google` → **Save**.
   - In Vercel: **Deployments** → the latest one → **⋯ → Redeploy**.
6. Open your site and click **Sign in with Google**. The first time anyone signs in, the site creates a **Work** calendar and a **Capital Mortgage** reminders list in their Google account automatically.

## Optional — your own web address

To use an address like `calendar.capitalmortgage.com`, go to Vercel → **Settings → Domains** and follow the steps there. Then update `NEXTAUTH_URL` and the Google redirect URI to the new address, and redeploy.

---

## Adding or removing team members

Who can sign in is controlled by `config/team.js`. Ask Claude something like:

> "Add Jordan Smith, jordan.smith@gmail.com, to the Capital Mortgage Calendar."

Claude updates the file. You upload it to GitHub (**config → team.js → pencil icon**, paste, **Commit**), and Vercel redeploys in about a minute. Removed people lose access the next time they open the site. Nobody's calendar is touched.

Each new person then:

1. Opens the site and signs in with the Google account in `team.js`.
2. Clicks **Set up booking page** and follows the steps. This gives them their own Mon–Sat 8–6 client booking link.
3. Optional: if they use an iPhone, clicks **Add Apple Calendar** to bring in iCloud calendars and to see their Work calendar on the phone.

## Changing business hours

Hours live in `config/team.js` (`businessHours`). After a change, each person should also update the hours on their Google booking page, because Google runs that page.

## Asking Claude for future changes

Start a new conversation, attach the current project as a zip (on GitHub: **Code → Download ZIP**) or connect GitHub, and describe the change. Claude edits the files. You commit them and the site redeploys. Calendars stay as they are.

## Where things are stored

| What | Where it lives |
|---|---|
| Appointments | each person's Google Calendar (Work calendar by default) |
| Reminders | each person's Google Tasks, list "Capital Mortgage" |
| Booking link | the description of each person's Work calendar |
| Who can sign in, hours | `config/team.js` in GitHub |

The site keeps no database. Sign-in is held in an encrypted cookie, and Google access tokens never reach the browser.
