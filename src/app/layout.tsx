import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Signature } from "@/components/signature";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Night Canteen",
  description: "Scan, order, and pay at the Night Canteen food truck.",
  authors: [{ name: "Megh Vyas" }],
  creator: "Megh Vyas",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        data-author="Megh Vyas"
        className="min-h-full flex flex-col bg-background text-foreground"
      >
        {children}
        <Signature />
      </body>
    </html>
  );
}
