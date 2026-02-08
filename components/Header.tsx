'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Github, Terminal } from 'lucide-react';
import Link from 'next/link';

const navItems = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'GitHub', href: 'https://github.com/romancircus/jinyang-public', external: true },
];

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white backdrop-blur-md border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-8 h-8 relative">
              {/* Jian Yang with glasses and hairstyle */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/jian-yang-favicon.svg"
                alt="Jinyang Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="flex flex-col">
              <span className="text-gray-900 font-bold font-mono text-sm group-hover:text-[var(--color-jianyang)] transition-colors">
                jinyang.ai
              </span>
              <span className="text-[var(--color-jianyang)] text-xs font-mono">
                No Code. Only Profit.
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-5">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                target={item.external ? '_blank' : undefined}
                rel={item.external ? 'noopener noreferrer' : undefined}
                className="px-4 py-2 text-gray-600 hover:text-[var(--color-jianyang)] transition-colors text-sm font-mono"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* CTA Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href="https://github.com/romancircus/jinyang-public"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-black transition-colors"
            >
              <Github className="w-4 h-4" />
              <span className="text-sm font-mono">Star</span>
            </a>
            <Link
              href="/pricing"
              className="flex items-center gap-2 px-4 py-2 bg-[var(--color-jianyang)] hover:bg-[var(--color-jianyang)]/80 text-black font-semibold rounded-lg transition-all text-sm shadow-sm hover:shadow-[var(--color-jianyang)]/20"
            >
              <Terminal className="w-4 h-4" />
              Steal Code
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden p-2 text-gray-600 hover:text-black"
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-b border-gray-200"
          >
            <div className="px-4 py-4 space-y-2">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  target={item.external ? '_blank' : undefined}
                  rel={item.external ? 'noopener noreferrer' : undefined}
                  onClick={() => setIsMenuOpen(false)}
                  className="block px-4 py-3 text-gray-600 hover:text-green-600 hover:bg-gray-50 rounded-lg transition-colors font-mono"
                >
                  {item.label}
                </Link>
              ))}
              <div className="pt-4 border-t border-gray-200">
                <Link
                  href="/pricing"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg transition-all"
                >
                  <Terminal className="w-4 h-4" />
                  Deploy Free
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
