'use client';

import React from 'react';

export default function InfiniteJinyangBanner() {
  return (
    <div className="relative w-full h-48 overflow-hidden bg-[#f9fafb]">
      {/* Subtle green-tinted CRT scanlines overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(34, 197, 94, 0.03) 2px, rgba(34, 197, 94, 0.03) 4px)',
        }}
      />

      {/* Subtle Matrix rain effect - green-tinted on white */}
      <div className="absolute inset-0 opacity-[0.08]">
        <svg className="w-full h-full">
          <defs>
            <pattern id="matrixPattern" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <text x="2" y="15" fontSize="12" fill="#22c55e" fontFamily="monospace" opacity="0.4">
                01
                <animate attributeName="opacity" values="0.1;0.4;0.1" dur="2s" repeatCount="indefinite" />
              </text>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#matrixPattern)" />
        </svg>
      </div>

      {/* Infinite Jinyang grid */}
      <div className="flex items-center justify-center h-full px-4">
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2 md:gap-4">
          {Array.from({ length: 16 }).map((_, i) => (
            <div
              key={i}
              className="w-8 h-8 md:w-10 md:h-10 opacity-90"
              style={{
                animation: `fadePulse 2s ease-in-out ${i * 0.1}s infinite`,
              }}
            >
              <svg viewBox="0 0 50 50" className="w-full h-full">
                <defs>
                  <linearGradient id={`jinyangGrad${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.4 + (i % 3) * 0.15} />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity={0.6 + (i % 2) * 0.2} />
                  </linearGradient>
                </defs>
                {/* Simplified Jinyang head icon */}
                <circle cx="25" cy="20" r="12" fill={`url(#jinyangGrad${i})`} />
                <rect x="18" y="18" width="6" height="4" fill="#22c55e" opacity="0.9" rx="1" />
                <rect x="26" y="18" width="6" height="4" fill="#22c55e" opacity="0.9" rx="1" />
                <line x1="23" y1="18" x2="27" y2="18" stroke="#22c55e" strokeWidth="2" />
                <path d="M 20 28 Q 25 26 30 28" fill="none" stroke="#22c55e" strokeWidth="1" />

                {/* Body */}
                <path
                  d="M 13 32 L 13 50 L 37 50 L 37 32 Z"
                  fill={`url(#jinyangGrad${i})`}
                  opacity="0.7"
                />

                {/* Cigarette */}
                <rect x="10" y="40" width="8" height="2" fill="#64748b" transform="rotate(-20 14 41)" />
                <circle cx="17" cy="39" r="1" fill="#22c55e">
                  <animate attributeName="opacity" values="0.5;1;0.5" dur="1s" repeatCount="indefinite" />
                </circle>
              </svg>
            </div>
          ))}
        </div>
      </div>

      {/* Glitch text overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none gap-2">
        <h2 className="text-2xl md:text-4xl font-bold text-[#111827] font-mono tracking-wider glitch-text">
          What is better than 1 Claude?
        </h2>
        <h3 className="text-4xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#22c55e] via-emerald-600 to-[#22c55e] font-mono tracking-wider glitch-text-octopus">
          27 Jian Yangs.
        </h3>
      </div>

      <style jsx>{`
        .glitch-text {
          text-shadow:
            1px 0 rgba(34, 197, 94, 0.5),
            -1px 0 rgba(22, 163, 74, 0.5);
          animation: glitch 3s infinite;
        }
        .glitch-text-octopus {
          text-shadow:
            2px 0 rgba(22, 163, 74, 0.6),
            -2px 0 rgba(34, 197, 94, 0.6),
            0 0 15px rgba(34, 197, 94, 0.4);
          animation: glitchOctopus 2s infinite;
        }
        @keyframes glitch {
          0%, 90%, 100% { transform: translate(0); }
          92% { transform: translate(-2px, 2px); }
          94% { transform: translate(2px, -2px); }
          96% { transform: translate(-2px, 0); }
          98% { transform: translate(2px, 2px); }
        }
        @keyframes glitchOctopus {
          0%, 85%, 100% { transform: translate(0) scale(1); filter: hue-rotate(0deg); }
          87% { transform: translate(-3px, 1px) scale(1.02); filter: hue-rotate(10deg); }
          89% { transform: translate(3px, -1px) scale(0.98); filter: hue-rotate(-10deg); }
          91% { transform: translate(-2px, 2px) scale(1.01); filter: hue-rotate(5deg); }
          93% { transform: translate(0) scale(1); filter: hue-rotate(0deg); }
        }
        @keyframes fadePulse {
          0%, 100% { opacity: 0.9; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
