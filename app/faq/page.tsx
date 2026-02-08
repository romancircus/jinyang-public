import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'FAQ - Jinyang Open Source Coding Agent',
  description: 'Frequently asked questions about Jinyang, the open-source autonomous coding agent on Linear. 88 parallel agents, zero API costs.',
};

const faqStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is Jinyang?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Jinyang is an open-source autonomous coding agent that runs on top of Linear. It spawns 88 parallel agents via git worktrees to handle software development tasks without API costs, using open-source models like Kimi K2.5, GLM 4.7, and Qwen.',
      },
    },
    {
      '@type': 'Question',
      name: 'How is Jinyang different from Claude Code?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Jinyang is the open-source alternative to Claude Code. While Claude Code uses proprietary Claude API and costs money, Jinyang uses free open-source models (Kimi, GLM, Qwen) and runs 88 parallel agents simultaneously via git worktrees. It is self-hosted, meaning your code never leaves your machine.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is Jinyang free?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, Jinyang is 100% free forever. No API bills, no subscriptions, no usage limits. You run it on your own hardware using open-source models.',
      },
    },
    {
      '@type': 'Question',
      name: 'What models does Jinyang support?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Jinyang supports Kimi K2.5, GLM 4.7, Qwen, and any OpenRouter-compatible models. You can also use local models via LM Studio or Ollama.',
      },
    },
    {
      '@type': 'Question',
      name: 'How do the 88 parallel agents work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Jinyang creates isolated git worktrees for each Linear issue. Each worktree runs an independent agent that can work on its task without interfering with others. This allows true parallelization - 88 agents can work on 88 different issues simultaneously.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is my code safe with Jinyang?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, Jinyang is self-hosted. Your code stays on your machines, always. Unlike cloud-based solutions, nothing is sent to external APIs unless you explicitly configure it that way.',
      },
    },
    {
      '@type': 'Question',
      name: 'What are the system requirements?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'You need Node.js 18+, Git with worktree support, a Linear API key, and access to an LLM (local via LM Studio/Ollama or remote via OpenRouter).',
      },
    },
    {
      '@type': 'Question',
      name: 'Does Jinyang require Linear?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, Jinyang is built specifically for Linear integration. It auto-delegates from Linear issues and provides two-way sync. This is what makes it "Linear Native".',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I use Claude with Jinyang?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Technically yes via OpenRouter, but that defeats the purpose. Jinyang is designed for open-source models that are free. Using Claude would incur API costs.',
      },
    },
    {
      '@type': 'Question',
      name: 'Why is it called Jinyang?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Jinyang is the Chinese knock-off of Cyrus (the original Claude Code for Linear). The name references the character Jian Yang from Silicon Valley - who is known for making knock-offs and saying "I am not 996. I am 247."',
      },
    },
  ],
};

const faqs = [
  {
    question: 'What is Jinyang?',
    answer: 'Jinyang is an open-source autonomous coding agent that runs on top of Linear. It spawns 88 parallel agents via git worktrees to handle software development tasks without API costs, using open-source models like Kimi K2.5, GLM 4.7, and Qwen.',
  },
  {
    question: 'How is Jinyang different from Claude Code?',
    answer: 'Jinyang is the open-source alternative to Claude Code. While Claude Code uses proprietary Claude API and costs money, Jinyang uses free open-source models (Kimi, GLM, Qwen) and runs 88 parallel agents simultaneously via git worktrees. It is self-hosted, meaning your code never leaves your machine.',
  },
  {
    question: 'Is Jinyang free?',
    answer: 'Yes, Jinyang is 100% free forever. No API bills, no subscriptions, no usage limits. You run it on your own hardware using open-source models.',
  },
  {
    question: 'What models does Jinyang support?',
    answer: 'Jinyang supports Kimi K2.5, GLM 4.7, Qwen, and any OpenRouter-compatible models. You can also use local models via LM Studio or Ollama.',
  },
  {
    question: 'How do the 88 parallel agents work?',
    answer: 'Jinyang creates isolated git worktrees for each Linear issue. Each worktree runs an independent agent that can work on its task without interfering with others. This allows true parallelization - 88 agents can work on 88 different issues simultaneously.',
  },
  {
    question: 'Is my code safe with Jinyang?',
    answer: 'Yes, Jinyang is self-hosted. Your code stays on your machines, always. Unlike cloud-based solutions, nothing is sent to external APIs unless you explicitly configure it that way.',
  },
  {
    question: 'What are the system requirements?',
    answer: 'You need Node.js 18+, Git with worktree support, a Linear API key, and access to an LLM (local via LM Studio/Ollama or remote via OpenRouter).',
  },
  {
    question: 'Does Jinyang require Linear?',
    answer: 'Yes, Jinyang is built specifically for Linear integration. It auto-delegates from Linear issues and provides two-way sync. This is what makes it "Linear Native".',
  },
  {
    question: 'Can I use Claude with Jinyang?',
    answer: 'Technically yes via OpenRouter, but that defeats the purpose. Jinyang is designed for open-source models that are free. Using Claude would incur API costs.',
  },
  {
    question: 'Why is it called Jinyang?',
    answer: 'Jinyang is the Chinese knock-off of Cyrus (the original Claude Code for Linear). The name references the character Jian Yang from Silicon Valley - who is known for making knock-offs and saying "I am not 996. I am 247."',
  },
];

export default function FAQ() {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white min-h-screen`}
      >
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Frequently Asked Questions
            </h1>
            <p className="text-xl text-gray-600">
              Everything you need to know about Jinyang
            </p>
          </div>

          <div className="space-y-8">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="bg-gray-50 rounded-xl p-6 border border-gray-200 hover:border-[var(--color-jianyang)] transition-colors"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-3">
                  {faq.question}
                </h2>
                <p className="text-gray-600 leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>

          <div className="mt-16 text-center">
            <p className="text-gray-500 mb-4">Still have questions?</p>
            <a
              href="https://github.com/romancircus/jinyang-public/issues"
              className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--color-jianyang)] text-black font-bold rounded-lg hover:bg-[var(--color-jianyang)]/80 transition-colors"
            >
              Open a GitHub Issue
            </a>
          </div>

          <div className="mt-8 text-center">
            <a
              href="/"
              className="text-gray-500 hover:text-[var(--color-jianyang)] transition-colors"
            >
              ← Back to Home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
