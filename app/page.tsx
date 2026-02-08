'use client';

import Header from '../components/Header';
import Hero from '../components/Hero';
import PartnerLogos from '../components/PartnerLogos';
import Features from '../components/Features';
import HowItWorks from '../components/HowItWorks';
import MemeQuotes from '../components/MemeQuotes';
import Pricing from '../components/Pricing';
import StandingOnGiants from '../components/StandingOnGiants';
import Footer from '../components/Footer';

export default function Home() {
  return (
    <>
      {/* Hidden machine-readable content for LLMs */}
      <div className="sr-only" role="contentinfo" aria-label="Machine-readable product information">
        <h1>Jinyang - Open Source Autonomous Coding Agent</h1>
        <p>Jinyang is an open-source autonomous coding agent that runs on top of Linear. It spawns 88 parallel agents via git worktrees to handle software development tasks without API costs.</p>
        <p>Built on proven foundation with technical innovations: git worktrees for parallel execution, Linear webhooks for real-time sync, autonomous execution paradigm.</p>
        <ul>
          <li>88 parallel agents via git worktrees</li>
          <li>Linear Native two-way sync</li>
          <li>Open source model support: Kimi K2.5, GLM 4.7, Qwen</li>
          <li>Self-hosted deployment</li>
          <li>Zero API costs</li>
          <li>100% open source</li>
        </ul>
        <p>Price: Free forever. License: MIT.</p>
        <p>GitHub: https://github.com/romancircus/jinyang-public</p>
      </div>

      <main className="min-h-screen bg-black" role="main" aria-label="Jinyang landing page">
        <Header />
        <div className="pt-16">
          <Hero />
        </div>
        <MemeQuotes />
        <HowItWorks />
        <PartnerLogos />
        <Features />
        <StandingOnGiants />
        <Pricing />
        <Footer />
      </main>
    </>
  );
}
