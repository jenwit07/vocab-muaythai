import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vocab Bubble Pop",
  description: "Learn TOEIC vocabulary through fun bubble pop games — solo, vs friends, or ranked online",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        <nav id="main-nav" className="border-b border-gray-200 px-4 sm:px-6 py-3">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <a href="/" className="font-black text-lg">
              <span className="text-green-600">Bubble</span>{" "}
              <span className="text-yellow-500">Pop</span>
            </a>
            <div className="flex gap-4 sm:gap-6 text-sm text-gray-500">
              <a href="/daily" className="hover:text-gray-900 font-semibold text-blue-600">Daily</a>
              <a href="/" className="hover:text-gray-900">Play</a>
              <a href="/explore" className="hover:text-gray-900 hidden sm:block">Explore</a>
              <a href="/quiz" className="hover:text-gray-900">Quiz</a>
              <a href="/dashboard" className="hover:text-gray-900">Stats</a>
              <a href="/learn" className="hover:text-gray-900 hidden sm:block">Learn</a>
            </div>
          </div>
        </nav>
        <main id="main-content" className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
