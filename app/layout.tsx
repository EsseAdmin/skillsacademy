import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkillsAcademy.ai — Build Your Own Learning Academy",
  description:
    "SkillsAcademy.ai lets businesses, charities and public sector organisations launch their own branded, multi-tenant training academy in minutes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
