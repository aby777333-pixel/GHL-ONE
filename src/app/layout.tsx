import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "GHL ONE", template: "%s · GHL ONE" },
  description: "One Company. One Workspace. One Source of Truth. The company operating system of GHL India Ventures.",
  applicationName: "GHL ONE",
  manifest: "/manifest.json",
  // iOS ignores an SVG apple-touch-icon: pointed at the SVG, "Add to Home Screen" used a
  // screenshot of the page as the icon. The PNG is what puts the mark on the home screen.
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  // Makes an installed iOS home-screen launch open chrome-less, the way Android already reads
  // `display: standalone` from the manifest. `default` rather than `black-translucent` so the
  // topbar is not drawn underneath the status bar clock.
  appleWebApp: { capable: true, title: "GHL ONE", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f17" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

const themeScript = `(function(){try{var t=localStorage.getItem('ghl-theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
