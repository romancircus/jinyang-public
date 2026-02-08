'use client';

import React from 'react';
import { Github, ArrowRight } from 'lucide-react';

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
