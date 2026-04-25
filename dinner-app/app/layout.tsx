import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

export const metadata: Metadata = {
  title: "What's for dinner?",
  description: "Your family recipe helper",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html className={geist.variable}>
      <body className="min-h-screen bg-zinc-50 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
