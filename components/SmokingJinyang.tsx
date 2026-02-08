import React from 'react';

export default function SmokingJinyang() {
  return (
    <div className="relative w-64 h-80 md:w-80 md:h-96">
      {/* CRT scanline overlay */}
      <div className="absolute inset-0 z-10 pointer-events-none opacity-40">
        <div 
          className="w-full h-full"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)',
            mixBlendMode: 'multiply'
          }}
        />
      </div>
      
      {/* Vignette effect */}
      <div 
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.5) 100%)'
        }}
      />

      {/* SVG Jin Yang smoking - ASCII/CRT art style */}
      <svg 
        viewBox="0 0 200 250" 
        className="w-full h-full drop-shadow-2xl"
        style={{ filter: 'drop-shadow(0 0 20px rgba(74, 222, 128, 0.3))' }}
      >
        <defs>
          <linearGradient id="crtGreen" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00FF41" />
            <stop offset="50%" stopColor="#00CC33" />
            <stop offset="100%" stopColor="#009922" />
          </linearGradient>
          <linearGradient id="crtDark" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1a1a2e" />
            <stop offset="100%" stopColor="#0f0f1a" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <filter id="crtNoise">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/>
            <feColorMatrix type="saturate" values="0"/>
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.1"/>
            </feComponentTransfer>
          </filter>
        </defs>

        {/* Background noise */}
        <rect width="100%" height="100%" filter="url(#crtNoise)" opacity="0.1"/>

        {/* Terminal frame */}
        <rect 
          x="10" y="10" 
          width="180" height="230" 
          fill="url(#crtDark)" 
          stroke="url(#crtGreen)" 
          strokeWidth="2"
          rx="4"
        />

        {/* Jin Yang silhouette - iconic smoking pose */}
        <g transform="translate(0, 20)">
          {/* Head */}
          <ellipse cx="100" cy="60" rx="35" ry="40" fill="#2d2d3a" stroke="url(#crtGreen)" strokeWidth="1.5" />
          
          {/* Hair - styled */}
          <path 
            d="M 65 50 Q 80 35 100 35 Q 120 35 135 50 L 135 45 Q 120 25 100 25 Q 80 25 65 45 Z" 
            fill="#3d3d4a" 
            stroke="url(#crtGreen)" 
            strokeWidth="1"
          />

          {/* Face features - stoic expression */}
          {/* Eyes - deadpan */}
          <ellipse cx="88" cy="55" rx="4" ry="3" fill="#4ade80" opacity="0.6" />
          <ellipse cx="112" cy="55" rx="4" ry="3" fill="#4ade80" opacity="0.6" />
          
          {/* Glasses */}
          <rect x="78" y="50" width="18" height="10" fill="none" stroke="url(#crtGreen)" strokeWidth="1.5" rx="2" />
          <rect x="104" y="50" width="18" height="10" fill="none" stroke="url(#crtGreen)" strokeWidth="1.5" rx="2" />
          <line x1="96" y1="55" x2="104" y2="55" stroke="url(#crtGreen)" strokeWidth="1.5" />

          {/* Nose */}
          <line x1="100" y1="55" x2="100" y2="65" stroke="url(#crtGreen)" strokeWidth="1" />

          {/* Mouth - slight frown/smirk */}
          <path d="M 90 72 Q 100 70 110 72" fill="none" stroke="url(#crtGreen)" strokeWidth="1.5" />

          {/* Neck */}
          <rect x="90" y="95" width="20" height="15" fill="#2d2d3a" />

          {/* Body - smoking pose */}
          <path 
            d="M 75 110 L 60 140 L 60 200 L 140 200 L 140 140 L 125 110 Z" 
            fill="#2d2d3a" 
            stroke="url(#crtGreen)" 
            strokeWidth="1.5"
          />

          {/* Shirt */}
          <path d="M 75 140 L 100 130 L 125 140" fill="none" stroke="url(#crtGreen)" strokeWidth="1" opacity="0.5" />

          {/* Left arm - holding cigarette */}
          <path 
            d="M 60 150 L 45 170 L 50 180" 
            fill="none" 
            stroke="url(#crtGreen)" 
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Hand with cigarette */}
          <circle cx="50" cy="180" r="5" fill="#4ade80" />
          
          {/* Cigarette */}
          <rect x="45" y="175" width="15" height="3" fill="#94a3b8" transform="rotate(-30 50 180)" />
          
          {/* Cigarette glow */}
          <circle cx="58" cy="173" r="2" fill="#ef4444" filter="url(#glow)" />

          {/* Smoke particles */}
          <g opacity="0.6">
            <circle cx="60" cy="165" r="3" fill="#4ade80" filter="url(#glow)">
              <animate attributeName="cy" values="165;155;145;135" dur="3s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;0.3;0.1;0" dur="3s" repeatCount="indefinite" />
              <animate attributeName="r" values="3;4;5;6" dur="3s" repeatCount="indefinite" />
            </circle>
            <circle cx="63" cy="168" r="2" fill="#4ade80" filter="url(#glow)">
              <animate attributeName="cy" values="168;158;148;138" dur="3s" begin="1s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.6;0.3;0.1;0" dur="3s" begin="1s" repeatCount="indefinite" />
              <animate attributeName="r" values="2;3;4;5" dur="3s" begin="1s" repeatCount="indefinite" />
            </circle>
          </g>

          {/* Right arm */}
          <path 
            d="M 140 150 L 155 170 L 150 180" 
            fill="none" 
            stroke="url(#crtGreen)" 
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="150" cy="180" r="5" fill="#4ade80" />
        </g>

        {/* ASCII art decoration at bottom */}
        <text 
          x="100" y="235" 
          textAnchor="middle" 
          fill="#00FF41" 
          fontSize="8" 
          fontFamily="monospace"
          opacity="0.7"
        >
          ┌── JIAN YANG ──┐
        </text>
        <text 
          x="100" y="242" 
          textAnchor="middle" 
          fill="#00FF41" 
          fontSize="6" 
          fontFamily="monospace"
          opacity="0.5"
        >
          NOT A TOOL
        </text>

        {/* Cursor blink */}
        <rect x="140" y="242" width="4" height="6" fill="#00FF41">
          <animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite" />
        </rect>
      </svg>
    </div>
  );
}
