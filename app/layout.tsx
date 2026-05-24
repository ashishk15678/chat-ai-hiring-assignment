import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ApiKeyProvider } from "@/components/providers";
import { Sidebar } from "@/components/sidebar";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "LLM Logger — Chat",
  description: "Fast LLM chatbot with inference observability built in.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className="font-[var(--font-geist)]">
        <ApiKeyProvider>
          <div className="flex h-screen overflow-hidden bg-background">
            <Sidebar />
            <main className="flex-1 flex flex-col overflow-hidden">
              {children}
            </main>
          </div>
        </ApiKeyProvider>
      </body>
    </html>
  );
}
