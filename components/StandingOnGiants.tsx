'use client';

import React from 'react';
import { Github, GitBranch, Zap, MessageSquare, Layers, ArrowRight } from 'lucide-react';

export default function StandingOnGiants() {
  return (
    <section className="relative py-20 bg-gray-50 border-t border-gray-200 overflow-hidden">
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(34, 197, 94, 0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34, 197, 94, 0.5) 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }}>
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-gray-200 mb-6 shadow-sm">
            <Layers className="w-4 h-4 text-[var(--color-jianyang)]" />
            <span className="text-gray-900 font-mono text-sm font-semibold">Built on Proven Foundation</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Why I Build on Cyrus (Because They Already Solved The Hard Problems)
          </h2>
          <p className="text-xl text-gray-500 max-w-3xl mx-auto italic">
            &ldquo;Everything good = them. Everything broken = me.&rdquo;
          </p>
        </div>

        {/* Cyrus Credit Card */}
        <div className="max-w-4xl mx-auto mb-16">
          <div className="relative p-8 md:p-12 rounded-2xl bg-white border border-gray-200 shadow-lg">
            <div className="absolute -top-4 left-8 px-4 py-1 bg-[var(--color-jianyang)] text-black font-bold text-sm rounded-full font-mono">
              The Foundation
            </div>

            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">
                  Three Technical Breakthroughs I Keep (Because They Perfect)
                </h3>
                <p className="text-gray-600 mb-6 leading-relaxed">
                  Hard problems already solved = git worktrees for parallel execution, Linear webhooks for instant sync, autonomous execution paradigm for no-human coding.
                  I take these three gifts, I make 88 agents scale. <a href="https://atcyrus.com" target="_blank" rel="noopener noreferrer" className="text-[var(--color-jianyang)] hover:underline font-semibold">Cyrus foundation</a>
                  prove one agent work. I prove 88 agents work better, zero API cost. Very good deal for you.
                </p>
                <div className="flex flex-wrap gap-3">
                  <a
                    href="https://github.com/ceedaragents/cyrus"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all duration-300 font-mono text-sm group"
                  >
                    <Github className="w-4 h-4" />
                    Explore on GitHub
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </a>
                  <a
                    href="https://atcyrus.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 border-2 border-gray-900 text-gray-900 rounded-lg hover:bg-gray-900 hover:text-white transition-all duration-300 font-mono text-sm"
                  >
                    Visit atcyrus.com
                  </a>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
                  <GitBranch className="w-5 h-5 text-[var(--color-jianyang)] mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-gray-900 text-sm">Git Worktrees</h4>
                    <p className="text-gray-500 text-sm">Perfect isolation system. Each agent = separate worktree. No conflicts, no crashes.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
                  <Zap className="w-5 h-5 text-[var(--color-jianyang)] mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-gray-900 text-sm">Linear Webhooks</h4>
                    <p className="text-gray-500 text-sm">Real-time sync perfected. Issue change → instant agent spawn. Zero delay.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
                  <MessageSquare className="w-5 h-5 text-[var(--color-jianyang)] mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-gray-900 text-sm">Execution Paradigm</h4>
                    <p className="text-gray-500 text-sm">Perfect autonomous framework. Code writes itself while you sleep.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Clarification */}
        <div className="max-w-3xl mx-auto text-center">
          <div className="p-6 bg-white rounded-xl border border-gray-200 shadow-sm">
            <h4 className="text-lg font-bold text-gray-900 mb-3">
              Built on a Solid Foundation
            </h4>
            <p className="text-gray-600 leading-relaxed">
              Three technical breakthroughs = theirs. 88-agent scaling = mine.
              Git worktrees perfect for parallel execution, Linear webhooks perfect for real-time sync,
              autonomous execution perfect for no-human coding. I take perfect foundation, I make perfecter for you.
              Thank you to original team for Apache 2.0 gift. I build on proven foundation, I build empire for open source.
            </p>
          </div>
        </div>

        {/* GitHub Links */}
        <div className="flex flex-wrap justify-center gap-4 mt-12">
          <a
            href="https://github.com/ceedaragents/cyrus"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gray-300 hover:border-[var(--color-jianyang)] hover:bg-[var(--color-jianyang)]/5 transition-all duration-300 text-gray-700 hover:text-[var(--color-jianyang)]"
          >
            <Github className="w-4 h-4" />
            <span className="font-mono text-sm">github.com/ceedaragents/cyrus</span>
          </a>
          <a
            href="https://github.com/romancircus/jinyang-public"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-jianyang)] text-black hover:bg-[var(--color-jianyang)]/90 transition-all duration-300"
          >
            <Github className="w-4 h-4" />
            <span className="font-mono text-sm font-semibold">github.com/romancircus/jinyang-public</span>
          </a>
        </div>
      </div>
    </section>
  );
}
