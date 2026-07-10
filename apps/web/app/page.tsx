export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="space-y-4 pt-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          Know Your Weak Spots
        </h1>
        <p className="mx-auto max-w-lg text-lg text-gray-400">
          Personalized TOEIC vocabulary coaching. Take quizzes, discover which
          categories you struggle with, and get AI-powered explanations for
          confusing words.
        </p>
        <div className="flex justify-center gap-4 pt-4">
          <a
            href="/quiz"
            className="rounded-lg bg-blue-600 px-6 py-3 font-medium hover:bg-blue-500"
          >
            Start Quiz
          </a>
          <a
            href="/dashboard"
            className="rounded-lg border border-gray-700 px-6 py-3 font-medium hover:border-gray-500"
          >
            My Dashboard
          </a>
        </div>
      </section>

      <section className="grid gap-6 pt-8 sm:grid-cols-3">
        {[
          {
            title: "Vocab Quiz",
            desc: "Test yourself across 10 TOEIC categories and track your accuracy.",
          },
          {
            title: "Weakness Detection",
            desc: "See which categories and words you struggle with most.",
          },
          {
            title: "AI Explanations",
            desc: "Get personalized explanations for confused word pairs using RAG.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-xl border border-gray-800 p-6 space-y-2"
          >
            <h3 className="font-semibold">{f.title}</h3>
            <p className="text-sm text-gray-400">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
