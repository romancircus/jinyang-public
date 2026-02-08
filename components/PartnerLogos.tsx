'use client';

import React from 'react';
import { motion } from 'framer-motion';

// Partner logos component - Jinyang + Kimi K2.5 + GLM + OpenCode + Linear
// Design inspired by atcyrus.com - clean horizontal layout with emphasis on key partners
export default function PartnerLogos() {
  const partners = [
    {
      name: 'Kimi',
      description: 'Moonshot AI',
      color: '#1783FF',
      logo: '/logos/kimi.svg',
      featured: false
    },
    {
      name: 'GLM',
      description: 'Zhipu AI',
      color: '#1A1A2E',
      logo: '/logos/zhipu.svg',
      featured: false
    }
  ];

  // Featured partners - given more emphasis
  const featuredPartners = [
    {
      name: 'Linear',
      description: 'Issue Tracking',
      color: '#5E6AD2',
      logo: '/logos/linear.svg',
      featured: true,
      size: 'large'
    },
    {
      name: 'OpenCode',
      description: 'IDE Agent',
      color: '#211E1E',
      logo: '/logos/opencode.svg',
      featured: true,
      size: 'large'
    }
  ];

  return (
    <section className="relative py-20 px-4 bg-white overflow-hidden">
      {/* Subtle background grid - atcyrus style */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 0, 0, 0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 0, 0, 0.5) 1px, transparent 1px)
          `,
          backgroundSize: '80px 80px',
        }}
      />

      <div className="relative max-w-6xl mx-auto">
        {/* Section header - atcyrus inspired */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
            Trusted by developers worldwide
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
            <span className="text-[var(--color-jianyang)] font-mono">I Control</span> Every Model
          </h2>
        </motion.div>

        {/* Main partner showcase - atcyrus style horizontal layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
          {/* Jinyang - Main identity */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="lg:col-span-1"
          >
            <div className="relative group h-full">
              <div className="absolute -inset-1 bg-[var(--color-jianyang)]/10 rounded-2xl blur-xl group-hover:bg-[var(--color-jianyang)]/20 transition-all duration-500" />
              <div className="relative h-full flex flex-col items-center justify-center p-8 bg-white border border-gray-200 rounded-2xl hover:border-[var(--color-jianyang)]/40 transition-all duration-300 shadow-sm">
                <div className="w-16 h-16 mb-4">
                  <img src="/the-boss-icon.svg" alt="Jian Yang" className="w-full h-full" />
                </div>
                <div className="text-[var(--color-jianyang)] font-bold text-xl font-mono">Jinyang</div>
                <div className="text-gray-500 text-sm mt-1">The Boss</div>
              </div>
            </div>
          </motion.div>

          {/* Featured Partners - Linear & OpenCode */}
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {featuredPartners.map((partner, index) => (
              <motion.div
                key={partner.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="relative group"
              >
                <div className={`absolute -inset-1 rounded-2xl blur-xl transition-all duration-500 ${
                  partner.name === 'Linear' 
                    ? 'bg-[#5E6AD2]/10 group-hover:bg-[#5E6AD2]/20' 
                    : 'bg-gray-400/10 group-hover:bg-gray-400/20'
                }`} />
                <div className="relative h-full flex flex-col items-center justify-center p-8 bg-white border-2 border-gray-200 rounded-2xl hover:border-gray-400 transition-all duration-300 shadow-sm">
                  <div className="w-20 h-20 mb-4 flex items-center justify-center">
                    <img 
                      src={partner.logo} 
                      alt={partner.name}
                      className={`w-full h-full object-contain ${partner.name === 'OpenCode' ? 'scale-[2.2]' : ''}`}
                    />
                  </div>
                  <div className="text-gray-900 font-bold text-lg">{partner.name}</div>
                  <div className="text-gray-500 text-sm mt-1">{partner.description}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Secondary partners row - Kimi & GLM */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-wrap items-center justify-center gap-4"
        >
          <div className="text-gray-400 text-sm font-medium mr-4">Also works with:</div>
          
          {partners.map((partner, index) => (
            <motion.div
              key={partner.name}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="group"
            >
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 hover:border-gray-300 hover:bg-white transition-all duration-300">
                <div className="w-8 h-8 flex items-center justify-center">
                  <img 
                    src={partner.logo} 
                    alt={partner.name}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <div className="text-gray-900 text-sm font-semibold">{partner.name}</div>
                  <div className="text-gray-500 text-xs">{partner.description}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Cyrus Community Appreciation */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-16 text-center max-w-2xl mx-auto"
        >
          <div className="p-6 rounded-2xl bg-gray-50 border border-gray-200">
            <p className="text-gray-600 text-sm leading-relaxed">
              <span className="font-semibold text-[var(--color-jianyang)]">Built on the shoulders of giants.</span>{' '}
              I forked <a href="https://github.com/ceedaragents/cyrus" target="_blank" rel="noopener noreferrer" className="text-gray-900 underline decoration-[var(--color-jianyang)]/30 hover:decoration-[var(--color-jianyang)] transition-all">Cyrus</a> to extend it for open source models (Kimi, GLM, Qwen) and OpenCode integration. Cyrus loves Claude, I love open source. Check out the community version.
            </p>
            <p className="text-gray-500 text-xs mt-3 font-mono">
              Thank you to the Cyrus team for the inspiration.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
