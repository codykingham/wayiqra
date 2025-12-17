import type { Metadata } from "next";
import { Noto_Serif_Hebrew, Tangerine } from "next/font/google";
import "./globals.css";

const notoSerifHebrew = Noto_Serif_Hebrew({
  variable: "--font-hebrew",
  subsets: ["hebrew"],
  weight: ["400", "700"],
});

const tangerine = Tangerine({
  variable: "--font-english",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Wayiqra - Isaiah 53",
  description: "A Hebrew reading companion for Isaiah 53",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he">
      <body className={`${notoSerifHebrew.variable} ${tangerine.variable}`}>
        {children}
      </body>
    </html>
  );
}
