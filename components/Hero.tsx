'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Github, ArrowRight, Terminal } from 'lucide-react';

export default function Hero() {
  const [isGifLoaded, setIsGifLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const timer = setTimeout(() => {
      const isDesktop = window.innerWidth >= 1024;
      const connection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
      const isFastConnection = connection?.effectiveType === '4g';
      const prefersAnimation = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;

      if (isDesktop && isFastConnection && prefersAnimation) {
        const img = new Image();
        img.src = '/glitch_hero_extended_web.gif';
        img.onload = () => setIsGifLoaded(true);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-white">
      {/* Animated background grid */}
      <div className="absolute inset-0 opacity-40">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `
              linear-gradient(rgba(34, 197, 94, 0.05) 1px, transparent 1px),
              linear-gradient(90deg, rgba(34, 197, 94, 0.05) 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
          }}
        />
      </div>

      {/* Gradient orbs - more subtle for light mode */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-green-200/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-green-300/20 rounded-full blur-3xl animate-pulse delay-1000" />

      <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        {/* Desktop: 2-column grid | Mobile: Single column */}
        <div className="grid lg:grid-cols-2 gap-12 items-center">

          {/* Left content - Text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="order-2 lg:order-1"
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-50 border border-gray-200 mb-6 shadow-sm group hover:border-[var(--color-jianyang)] transition-colors"
            >
              <Terminal className="w-4 h-4 text-[var(--color-jianyang)]" />
              <span className="text-gray-900 font-mono text-sm font-semibold group-hover:text-[var(--color-jianyang)] transition-colors">
                Linear + OpenCode
              </span>
            </motion.div>

            {/* Main headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-4xl md:text-6xl lg:text-7xl font-bold text-gray-900 mb-6 leading-tight tracking-tight"
            >
              <span className="line-through decoration-4 decoration-red-500 text-gray-400">Chinese</span>{' '}
              <br />
              <span className="text-[var(--color-jianyang)] font-mono">Open Source Coding Sweatshop</span>
            </motion.h1>

            {/* Subheadline - Jin Yang Quote */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="mb-6"
            >
              <p className="text-2xl md:text-3xl text-gray-700 font-mono italic">
                &ldquo;I am not 996. I am 247.&rdquo;
              </p>
              <p className="text-sm md:text-base text-gray-500 font-mono mt-2">
                — Jinyang, on market efficiency
              </p>
            </motion.div>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="text-gray-600 text-lg mb-6 max-w-xl leading-relaxed"
            >
              88 agents work for you on Linear. Very good deal. Built on proven foundation, optimized for open source models.
            </motion.p>

            {/* Mobile-only image (hidden on desktop) */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.55, duration: 0.5 }}
              className="lg:hidden relative w-full max-w-xs mx-auto my-6"
            >
              <div className="relative aspect-square">
                <div className="absolute inset-0 bg-green-500/10 blur-3xl rounded-full scale-110" />
                <div className="absolute inset-0 overflow-hidden rounded-lg z-20 pointer-events-none">
                  <div className="matrix-rain absolute inset-0 opacity-30" />
                </div>
                <div
                  className="absolute inset-0 z-20 pointer-events-none opacity-20"
                  style={{
                    background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34, 197, 94, 0.1) 2px, rgba(34, 197, 94, 0.1) 4px)',
                  }}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={isGifLoaded ? '/glitch_hero_extended_web.gif' : '/primary-jinyang-ai-hero-image.png'}
                  alt="Jian Yang"
                  className="relative z-10 w-full h-auto object-contain drop-shadow-2xl hover:scale-105 transition-transform duration-500"
                />
              </div>
            </motion.div>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="flex flex-wrap gap-4"
            >
              <a
                href="https://github.com/romancircus/jinyang-public"
                className="group inline-flex items-center gap-2 px-6 py-3 bg-[var(--color-jianyang)] hover:bg-[var(--color-jianyang)]/80 text-black font-bold rounded-lg transition-all duration-300 hover:shadow-lg hover:shadow-[var(--color-jianyang)]/25"
              >
                <Github className="w-5 h-5" />
                GitHub
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>
              <a
                href="#pricing"
                className="inline-flex items-center gap-2 px-6 py-3 border border-gray-200 hover:border-[var(--color-jianyang)]/50 text-gray-700 hover:text-[var(--color-jianyang)] hover:bg-gray-50 rounded-lg transition-all duration-300 font-mono bg-white shadow-sm"
              >
                Self-hosted
              </a>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className="flex flex-wrap gap-12 mt-12 pt-8 border-t border-gray-100"
            >
              <div>
                <div className="text-3xl font-bold text-gray-900 font-mono">88</div>
                <div className="text-sm text-gray-500 font-medium">Parallel Agents</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-gray-900 font-mono">100%</div>
                <div className="text-sm text-gray-500 font-medium">Free</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-gray-900 font-mono">Self-hosted</div>
                <div className="text-sm text-gray-500 font-medium">No API Bill</div>
              </div>
            </motion.div>
          </motion.div>

          {/* Right content - Desktop image (hidden on mobile) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="relative hidden lg:flex items-center justify-center lg:justify-end order-1 lg:order-2"
          >
            <div className="relative w-full max-w-md aspect-square">
              {/* Glow effect behind image */}
              <div className="absolute inset-0 bg-green-500/10 blur-3xl rounded-full scale-110" />

              {/* Matrix Binary Rain Overlay */}
              <div className="absolute inset-0 overflow-hidden rounded-lg z-20 pointer-events-none">
                <div className="matrix-rain absolute inset-0 opacity-30" />
              </div>

              {/* Green CRT Scanline Overlay */}
              <div
                className="absolute inset-0 z-20 pointer-events-none opacity-20"
                style={{
                  background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34, 197, 94, 0.1) 2px, rgba(34, 197, 94, 0.1) 4px)',
                }}
              />

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={isGifLoaded ? '/glitch_hero_extended_web.gif' : '/primary-jinyang-ai-hero-image.png'}
                alt="Jian Yang"
                className="relative z-10 w-full h-auto object-contain drop-shadow-2xl hover:scale-105 transition-transform duration-500"
              />
            </div>
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-400"
      >
        <span className="text-sm font-mono uppercase tracking-wider">scroll</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="w-5 h-8 border-2 border-gray-300 rounded-full flex justify-center"
        >
          <motion.div
            animate={{ y: [0, 12, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-1 h-2 bg-gray-400 rounded-full mt-2"
          />
        </motion.div>
      </motion.div>

      {/* Matrix Rain CSS */}
      <style jsx>{`
        .matrix-rain {
          background: linear-gradient(180deg,
            transparent 0%,
            rgba(34, 197, 94, 0.1) 50%,
            transparent 100%
          );
          animation: matrix-fall 3s linear infinite;
          background-image:
            linear-gradient(90deg, transparent 95%, rgba(34, 197, 94, 0.2) 95%);
          background-size: 20px 100%;
        }

        .matrix-rain::before {
          content: '1010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010';
          position: absolute;
          top: -100%;
          left: 0;
          right: 0;
          font-family: monospace;
          font-size: 14px;
          color: rgba(34, 197, 94, 0.4);
          word-break: break-all;
          line-height: 1.2;
          animation: matrix-scroll 8s linear infinite;
          text-shadow: 0 0 5px rgba(34, 197, 94, 0.5);
        }

        .matrix-rain::after {
          content: '0101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101';
          position: absolute;
          top: -50%;
          left: 10px;
          right: 0;
          font-family: monospace;
          font-size: 12px;
          color: rgba(34, 197, 94, 0.3);
          word-break: break-all;
          line-height: 1.4;
          animation: matrix-scroll 6s linear infinite reverse;
          text-shadow: 0 0 3px rgba(34, 197, 94, 0.4);
        }

        @keyframes matrix-fall {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }

        @keyframes matrix-scroll {
          0% { transform: translateY(0); }
          100% { transform: translateY(100%); }
        }
      `}</style>
    </section>
  );
}
