import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "IoBot · Your day at ʻIolani", description: "Your official bell schedule, class countdowns, campus dining, and five-day planner.", manifest: "/manifest.webmanifest", icons: { icon: "/favicon.svg" }, appleWebApp: { capable: true, title: "IoBot", statusBarStyle: "black-translucent" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#090b10" };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en" data-theme="dark" suppressHydrationWarning><body>{children}</body></html>; }
