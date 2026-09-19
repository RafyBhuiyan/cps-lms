import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Nav } from "@/components/Nav";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CPS LMS",
  description:
    "Courses, lessons, server-graded quizzes and progress tracking, on a Strapi backend.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {/* The session lives in localStorage, so it is restored in the browser and
            every page below is client-rendered. */}
        <AuthProvider>
          <Nav />
          {children}
          <footer className="border-t border-black/10 px-6 py-6 text-center text-xs text-zinc-500 dark:border-white/15">
            Quizzes are graded on the server; the answer key never reaches this app.
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
