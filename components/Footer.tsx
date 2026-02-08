'use client';

import React from 'react';
import { Github, Twitter, MessageCircle } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="relative bg-white border-t border-gray-200">
      {/* Light CRT effect */}
      <div className="absolute inset-0 crt-scanline opacity-50 z-0" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-3 gap-8 items-center">
          {/* Logo & tagline */}
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-3 mb-3">
              <div className="w-8 h-8 relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/jian-yang-favicon.svg"
                  alt="Jinyang Logo"
                  className="w-full h-full object-contain"
                />
              </div>
              <span className="text-xl font-bold text-gray-900 font-mono">jinyang.ai</span>
            </div>
            <p className="text-gray-500 text-sm">
              Are You Open Minded?
            </p>
          </div>

          {/* Navigation */}
          <div className="flex flex-wrap justify-center gap-6">
            <a href="/" className="text-gray-500 hover:text-[var(--color-jianyang)] transition-colors text-sm">
              Home
            </a>
            <a href="/pricing" className="text-gray-500 hover:text-[var(--color-jianyang)] transition-colors text-sm">
              Pricing
            </a>
            <a href="/faq" className="text-gray-500 hover:text-[var(--color-jianyang)] transition-colors text-sm">
              FAQ
            </a>
            <a href="https://github.com/romancircus/jinyang-public" className="text-gray-500 hover:text-[var(--color-jianyang)] transition-colors text-sm">
              GitHub
            </a>
          </div>

          {/* Social links */}
          <div className="flex justify-center md:justify-end gap-4">
            <a
              href="https://github.com/romancircus/jinyang-public"
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-full bg-gray-50 hover:bg-[var(--color-jianyang)]/10 border border-gray-200 hover:border-[var(--color-jianyang)] flex items-center justify-center transition-all duration-300 group shadow-sm"
            >
              <Github className="w-5 h-5 text-gray-400 group-hover:text-[var(--color-jianyang)]" />
            </a>
            <a
              href="https://x.com/romancircus"
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-full bg-gray-50 hover:bg-[var(--color-jianyang)]/10 border border-gray-200 hover:border-[var(--color-jianyang)] flex items-center justify-center transition-all duration-300 group shadow-sm"
            >
              <Twitter className="w-5 h-5 text-gray-400 group-hover:text-[var(--color-jianyang)]" />
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 pt-8 border-t border-gray-100 text-center">
          <p className="text-gray-500 text-sm font-mono mb-2">
            &ldquo;If you copy, I sue. If I copy, is fair use.&rdquo;
          </p>
          <p className="text-gray-400 text-xs">
            © {new Date().getFullYear()} Jin Yang&apos;s AI Empire. Open source under MIT License.
          </p>
          <p className="text-gray-400 text-xs mt-2">
            Not affiliated with HBO, Silicon Valley, or Pied Piper. Fair use of character likeness for parody.
          </p>
          <p className="text-gray-400 text-xs mt-2">
            Built on proven foundation from <a href="https://github.com/ceedaragents/cyrus" target="_blank" rel="noopener noreferrer" className="text-[var(--color-jianyang)] hover:underline">original team</a> — the foundation for autonomous coding agents.
          </p>
        </div>
      </div>
    </footer>
  );
}
