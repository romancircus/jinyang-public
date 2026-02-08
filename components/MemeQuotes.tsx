'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const quotes = [
  {
    quote: "No firewall. No rent.",
    context: "On infrastructure",
    icon: "🇨🇳"
  },
  {
    quote: "I have many friends in China. Very smart people.",
    context: "On Kimi K2.5 & GLM 4.7",
    icon: "🤝"
  },
  {
    quote: "I build the new internet.",
    context: "On ambition",
    icon: "💼"
  },
  {
    quote: "You pay for API. I pay nothing.",
    context: "On efficiency",
    icon: "💸"
  },
  {
    quote: "My code now.",
    context: "On licensing",
    icon: "🔓"
  },
  {
    quote: "I stay. I build.",
    context: "On persistence",
    icon: "🏠"
  },
  {
    quote: "My lawyer will reach out to your lawyer.",
    context: "On GitHub issues",
    icon: "⚖️"
  },
  {
    quote: "88 agents working in parallel. No human required.",
    context: "On scale",
    icon: "🔄"
  },
  {
    quote: "Who is this? Is this the FBI?",
    context: "On first-time users",
    icon: "👮"
  },
  {
    quote: "Web 4.0 is open source. Cloud is dead edge.",
    context: "On the future",
    icon: "🌐"
  },
  {
    quote: "China make AI. America take API. I take both.",
    context: "On global strategy",
    icon: "🌍"
  },
  {
    quote: "You want SaaS? I give you self-hosted.",
    context: "On subscriptions",
    icon: "🚫"
  }
];

export default function MemeQuotes() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % quotes.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="relative py-16 px-4 bg-white">
      {/* Terminal decoration */}
      <div className="max-w-3xl mx-auto">
        <div className="border border-gray-200 rounded-lg bg-white shadow-2xl relative overflow-hidden transform hover:scale-[1.01] transition-transform duration-300">
          {/* Terminal header */}
          <div className="flex items-center gap-2 mb-4 border-b border-gray-200 bg-gray-50 p-3 px-4">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-[var(--color-jianyang)]" />
            <span className="ml-4 text-gray-500 font-mono text-xs opacity-60">jinyang@agent:~$ cat quotes.json</span>
          </div>

          {/* Quote content - Inner padding */}
          <div className="p-6 pt-0">
            <div className="min-h-[120px] flex items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentIndex}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="text-center"
                >
                  <div className="text-4xl mb-4">{quotes[currentIndex].icon}</div>
                  <blockquote className="text-xl md:text-2xl font-mono text-[var(--color-jianyang)] mb-3">
                    &ldquo;{quotes[currentIndex].quote}&rdquo;
                  </blockquote>
                  <p className="text-[var(--color-jianyang)]/60 font-mono text-sm">
                    — {quotes[currentIndex].context}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Progress dots */}
            <div className="flex justify-center gap-2 mt-6">
              {quotes.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    i === currentIndex
                      ? 'bg-[var(--color-jianyang)] w-6'
                      : 'bg-gray-300 hover:bg-gray-400'
                  }`}
                />
              ))}
            </div>

            {/* Cursor */}
            <div className="mt-4 text-[var(--color-jianyang)]/60 font-mono text-sm flex items-center">
              <span className="mr-2">{`>`}</span>
              <span className="animate-pulse">_</span>
            </div>
          </div>

          {/* Subtle grid overlay for modern code editor look */}
          <div
            className="absolute inset-0 pointer-events-none opacity-5"
            style={{
              backgroundImage: `linear-gradient(to right, rgba(0, 0, 0, 0.1) 1px, transparent 1px),
                               linear-gradient(to bottom, rgba(0, 0, 0, 0.1) 1px, transparent 1px)`,
              backgroundSize: '20px 20px',
            }}
          />
        </div>
      </div>
    </div>
  );
}
