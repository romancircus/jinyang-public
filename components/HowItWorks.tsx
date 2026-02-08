'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ListTodo, ShoppingCart, Rocket } from 'lucide-react';

export default function HowItWorks() {
  const steps = [
    {
      step: '01',
      title: 'I live In Linear',
      description: 'I watch your Linear workspace 24/7. Always online. Always ready.',
      icon: 'favicon',
      color: 'from-green-400 to-emerald-500'
    },
    {
      step: '02',
      title: 'You Make Order',
      description: 'Create Linear issue. Assign to me. Or just mention me. I see everything.',
      icon: 'cart',
      color: 'from-emerald-400 to-teal-500'
    },
    {
      step: '03',
      title: 'I Ship It',
      description: '88 agents spawn. Git worktrees isolate. Code writes itself. PR appears. Magic.',
      icon: 'rocket',
      color: 'from-teal-400 to-cyan-500'
    }
  ];

  const renderIcon = (iconType: string) => {
    switch (iconType) {
      case 'favicon':
        return (
          <img
            src="/jian-yang-favicon.svg"
            alt="Jian Yang"
            className="w-10 h-10 object-contain"
          />
        );
      case 'cart':
        return (
          <div className="relative">
            <ShoppingCart className="w-10 h-10 text-[var(--color-jianyang)]" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-bounce">
              $
            </span>
          </div>
        );
      case 'rocket':
        return (
          <div className="relative">
            <Rocket className="w-10 h-10 text-[var(--color-jianyang)]" />
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 bg-orange-400 rounded-full blur-sm opacity-60 animate-pulse" />
          </div>
        );
      default:
        return <span className="text-4xl">🚀</span>;
    }
  };

  return (
    <section className="relative py-24 bg-white overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `
            linear-gradient(rgba(34, 197, 94, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34, 197, 94, 0.05) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-50 border border-gray-200 mb-6 shadow-sm">
            <ListTodo className="w-4 h-4 text-[var(--color-jianyang)]" />
            <span className="text-gray-900 font-mono text-sm font-semibold">Linear Native</span>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-4">
            How I Make You Money
          </h2>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto">
            Simple like my Mother&apos;s cooking. Three steps. No complexity.
          </p>
        </motion.div>

        {/* Steps grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, index) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.2 }}
              className="group relative"
            >
              <div className="relative p-8 rounded-2xl bg-white border border-gray-200 hover:border-[var(--color-jianyang)]/50 transition-all duration-300 shadow-sm hover:shadow-lg hover:shadow-[var(--color-jianyang)]/5">
                {/* Step number */}
                <div className="absolute -top-4 left-8 px-3 py-1 bg-[var(--color-jianyang)] text-black font-bold text-sm rounded-full font-mono">
                  {step.step}
                </div>

                {/* Icon */}
                <div className="mb-4">
                  {renderIcon(step.icon)}
                </div>

                {/* Content */}
                <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-[var(--color-jianyang)] transition-colors">
                  {step.title}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed">
                  {step.description}
                </p>

                {/* Hover glow */}
                <div className="absolute inset-0 rounded-2xl bg-[var(--color-jianyang)]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              </div>

              {/* Connector arrow for desktop */}
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-1/2 -right-4 w-8 h-px bg-gray-300" />
              )}
            </motion.div>
          ))}
        </div>

        {/* Bottom quote */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
          className="mt-16 text-center"
        >
          <p className="text-xl text-gray-600 font-mono italic max-w-2xl mx-auto">
            &ldquo;You make order. I ship. Very simple. Like Uber but for code.&rdquo;
          </p>
          <p className="text-sm text-gray-400 mt-2">— Jian Yang, on process</p>
        </motion.div>
      </div>
    </section>
  );
}
