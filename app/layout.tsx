import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://jinyang.ai'),
  title: 'Jinyang - Linear Native Coding Agent for OpenCode',
  description: 'Bridge Linear and OpenCode with Jinyang - the Linear Native Coding Agent. Automate software development with 88 parallel agents using open-source models (Kimi K2.5, GLM 4.7, Qwen). $0 forever, self-hosted.',
  alternates: {
    canonical: 'https://jinyang.ai',
  },
  icons: {
    icon: [
      { url: '/jian-yang-favicon.svg', type: 'image/svg+xml' },
      { url: '/jinyang-crt-favicon.png', type: 'image/png' },
    ],
    shortcut: '/jinyang-crt-favicon.png',
    apple: '/jinyang-crt-favicon.png',
  },
  openGraph: {
    title: 'Jinyang - Linear Native Coding Agent for OpenCode',
    description: 'Bridge Linear and OpenCode. 88 parallel agents, zero API costs, open-source models. The autonomous coding solution for Linear users.',
    type: 'website',
    locale: 'en_US',
    url: 'https://jinyang.ai',
    images: [
      {
        url: 'https://jinyang.ai/primary-jinyang-ai-hero-image.png',
        width: 1200,
        height: 630,
        alt: 'Jinyang - Linear Native Coding Agent for OpenCode',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Jinyang - Linear Native Coding Agent for OpenCode',
    description: '88 parallel agents. Zero API costs. 100% Open Source. Built for Linear + OpenCode.',
    images: ['https://jinyang.ai/primary-jinyang-ai-hero-image.png'],
  },
  other: {
    'ai-purpose': 'Linear Native Coding Agent that bridges Linear issue tracking with OpenCode agent ecosystem',
    'ai-capabilities': 'Linear integration, OpenCode compatibility, git worktree management, 88 parallel agents',
    'ai-models': 'Kimi K2.5, GLM 4.7, Qwen, OpenRouter compatible',
    'primary-use-case': 'Automate coding tasks on top of Linear with OpenCode-compatible agents',
    'target-platform': 'Linear + OpenCode',
    'solution-for': 'Developers wanting autonomous coding agents on Linear without API costs',
  },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Jinyang',
  alternateName: 'Linear Native Coding Agent',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Linux, macOS, Windows',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
  },
  description: 'Linear Native Coding Agent that runs on top of OpenCode. Bridges Linear issue tracking with OpenCode agent ecosystem. Spawns 88 parallel agents (worktrees) to handle software development tasks using open-source models (Kimi K2.5, GLM 4.7, Qwen) without API costs.',
  url: 'https://jinyang.ai',
  sameAs: [
    'https://github.com/romancircus/jinyang-public',
    'https://x.com/romancircus',
    'https://opencode.ai',
    'https://linear.app',
  ],
  author: {
    '@type': 'Organization',
    name: 'Roman Circus Studio',
    url: 'https://romancircus.studio',
  },
  featureList: [
    'Linear Native Coding Agent - built specifically for Linear',
    'OpenCode compatible - works with OpenCode agent ecosystem',
    '88 parallel agents via isolated git worktrees',
    'Two-way sync with Linear issues',
    'Open source model support: Kimi K2.5, GLM 4.7, Qwen',
    'Self-hosted deployment - code stays local',
    'Zero API costs - free forever',
    'Auto-delegation from Linear issues',
    'Git worktree isolation prevents merge conflicts',
  ],
  softwareRequirements: 'Node.js 18+, Git with worktree support, Linear API key, OpenCode-compatible environment',
  license: 'https://opensource.org/licenses/MIT',
  programmingLanguage: ['TypeScript', 'JavaScript'],
  isPartOf: {
    '@type': 'SoftwareApplication',
    name: 'OpenCode',
    url: 'https://opencode.ai',
  },
  targetProduct: {
    '@type': 'SoftwareApplication',
    name: 'Linear',
    url: 'https://linear.app',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[var(--color-background)]`}>
        {children}
      </body>
    </html>
  );
}
