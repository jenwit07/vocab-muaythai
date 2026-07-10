import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TOEIC Vocab Coach",
  description: "Personalized TOEIC vocabulary learning — find your weak spots and review smarter",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased">
        <nav id="main-nav" className="border-b border-gray-800 px-6 py-4">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <a href="/" className="text-lg font-bold">
              TOEIC Vocab Coach
            </a>
            <div className="flex gap-6 text-sm text-gray-400">
              <a href="/dashboard" className="hover:text-white">Dashboard</a>
              <a href="/quiz" className="hover:text-white">Quiz</a>
              <a href="/explore" className="hover:text-white">Explore</a>
              <a href="/game" className="hover:text-white text-yellow-400/80">Game</a>
              <a href="/learn" className="hover:text-white">Learn</a>
              <a href="/review" className="hover:text-white">Review</a>
            </div>
          </div>
        </nav>
        <main id="main-content" className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
