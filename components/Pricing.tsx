'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Check, Github, Sparkles, Zap, Lock } from 'lucide-react';

const freeFeatures = [
  "Unlimited Linear integration",
  "88 parallel agents",
  "Git worktree isolation",
  "Kimi K2.5 + GLM 4.7 support",
  "Open source models",
  "Self-hosted deployment",
  "Full source code access",
  "Community support",
];

export default function Pricing() {
  return (
    <section
      id="pricing"
      className="relative py-24 bg-gray-50"
      aria-labelledby="pricing-heading"
      itemScope
      itemType="https://schema.org/Product"
    >
      <meta itemProp="name" content="Jinyang" />
      <meta itemProp="description" content="Open-source autonomous coding agent with 88 parallel agents" />

      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[var(--color-jianyang)]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[var(--color-jianyang)]/5 rounded-full blur-3xl" />
      </div>

      {/* CRT scanlines */}
      <div
        className="absolute inset-0 pointer-events-none z-10 opacity-10"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34,197,94,0.1) 2px, rgba(34,197,94,0.1) 4px)',
        }}
      />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-jianyang)]/10 border border-[var(--color-jianyang)]/30 mb-6">
            <Sparkles className="w-4 h-4 text-[var(--color-jianyang)]" />
            <span className="text-[var(--color-jianyang)] font-mono text-sm">100% Free Forever</span>
          </div>

          <h2
            id="pricing-heading"
            className="text-4xl md:text-6xl font-bold text-gray-900 mb-4"
          >
            Web 4.0 is Open Source.
            <br />
            <span className="text-[var(--color-jianyang)]">Thank you. Come Again.</span>
          </h2>

          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Cloud is dead. Edge is alive. Run on your own machine.
            No subscription. No API bill. Just pure open source power.
          </p>
        </motion.div>

        {/* Pricing card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative"
          itemProp="offers"
          itemScope
          itemType="https://schema.org/Offer"
        >
          <meta itemProp="price" content="0" />
          <meta itemProp="priceCurrency" content="USD" />
          <meta itemProp="availability" content="https://schema.org/InStock" />
          <link itemProp="url" href="https://jinyang.ai/pricing" />

          {/* Card glow */}
          <div className="absolute -inset-1 bg-gradient-to-r from-[var(--color-jianyang)] via-emerald-500 to-[var(--color-jianyang)] rounded-2xl blur opacity-30" />

          <div className="relative bg-white rounded-2xl border-2 border-[var(--color-jianyang)]/20 hover:border-[var(--color-jianyang)] transition-colors duration-300 p-8 md:p-12 overflow-hidden shadow-lg">
            {/* Quote decoration */}
            <div className="absolute top-4 right-4 text-[var(--color-jianyang)]/10 font-mono text-6xl font-bold" aria-hidden="true">
              FREE
            </div>

            {/* Price */}
            <div className="text-center mb-8">
              <div className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
                <span className="text-[var(--color-jianyang)]">$0. Self-hosted.</span>
              </div>
              <p className="text-gray-600 text-lg mb-2">
                Run on your own hardware.
              </p>
              <p className="text-[var(--color-jianyang)]/80 text-sm mt-2 font-mono">
                You have computer. Use it.
              </p>
            </div>

            {/* CTA Button */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <a
                href="https://github.com/romancircus/jinyang-public"
                className="group inline-flex items-center justify-center gap-3 px-8 py-4 bg-[var(--color-jianyang)] hover:bg-[var(--color-jianyang)]/90 text-white font-bold rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-[var(--color-jianyang)]/25"
              >
                <Github className="w-5 h-5" />
                View on GitHub
                <Zap className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </a>
            </div>

            {/* Features */}
            <div className="border-t border-gray-200 pt-8">
              <p className="text-center text-gray-500 mb-6 font-mono text-sm">
                Everything you need to ship faster:
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                {freeFeatures.map((feature, index) => (
                  <motion.div
                    key={feature}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center gap-3 text-gray-700"
                  >
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--color-jianyang)]/20 flex items-center justify-center">
                      <Check className="w-3 h-3 text-[var(--color-jianyang)]" />
                    </div>
                    <span className="text-sm">{feature}</span>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Bottom note */}
            <div className="mt-8 pt-6 border-t border-gray-200 flex items-center justify-center gap-2 text-gray-500 text-sm">
              <Lock className="w-4 h-4" />
              <span>Your data stays on your machines. Always.</span>
            </div>
          </div>
        </motion.div>

        {/* FAQ teaser */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-16 text-center"
        >
          <p className="text-gray-500 mb-4">Questions?</p>
          <div className="flex flex-wrap justify-center gap-4 text-sm text-gray-600">
            <span className="px-4 py-2 rounded-full bg-white border border-gray-200">
              &ldquo;Is it safe?&rdquo;
            </span>
            <span className="px-4 py-2 rounded-full bg-white border border-gray-200">
              &ldquo;Can I use Claude?&rdquo;
            </span>
            <span className="px-4 py-2 rounded-full bg-white border border-gray-200">
              &ldquo;Why is Jian Yang smoking?&rdquo;
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-4">
            (Answers in the GitHub README. Read it.)
          </p>
        </motion.div>
      </div>
    </section>
  );
}
