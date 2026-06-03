import type { Metadata } from "next";
import "./globals.css";

const title = "Autonoma — Put your busywork on autopilot";
const description =
  "Autonoma builds custom AI automations that take repetitive, manual work off your team's plate — from inbox triage to data entry to reporting. Join the waitlist.";

export const metadata: Metadata = {
  metadataBase: new URL("https://autonoma.ai"),
  title,
  description,
  keywords: [
    "AI automation",
    "workflow automation",
    "AI agents",
    "business process automation",
    "Autonoma",
  ],
  openGraph: {
    title,
    description,
    type: "website",
    siteName: "Autonoma",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
