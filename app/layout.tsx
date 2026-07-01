import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Pwa } from "@/components/Pwa";
import { I18nProvider } from "@/components/I18nProvider";
import { getLang } from "@/lib/i18n/server";
import { dictionaries } from "@/lib/i18n/dictionaries";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const dict = dictionaries[await getLang()];
  return {
    title: "Coordination Board",
    description: dict.misc.metaDescription,
    appleWebApp: {
      capable: true,
      title: "Coord Board",
      statusBarStyle: "default",
    },
    icons: { icon: "/icon.svg", apple: "/icon.svg" },
  };
}

// Mobile-first PWA baseline (full PWA manifest + service worker arrives in M7).
// Light-only theme for now (better outdoor/job-site readability); theme-color
// matches the page background so the mobile browser chrome stays consistent.
export const viewport: Viewport = {
  themeColor: "#f6f7f9",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const lang = await getLang();
  return (
    <html
      lang={lang}
      translate="no"
      className={`${geistSans.variable} ${geistMono.variable} notranslate h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-clip">
        <I18nProvider dict={dictionaries[lang]} lang={lang}>
          {children}
          <Pwa />
        </I18nProvider>
      </body>
    </html>
  );
}
