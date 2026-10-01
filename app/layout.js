import "./globals.css";
import team from "@/config/team";

export const metadata = {
  title: `${team.companyName} Calendar`,
  description: `Team calendar for ${team.companyName}`,
  robots: { index: false, follow: false },
};

export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=Figtree:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
