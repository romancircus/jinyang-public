'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Cpu, GitBranch, Shield, Layers, Workflow } from 'lucide-react';

const features = [
  {
    icon: Cpu,
    title: "Any Open Source Model",
    description: "Kimi K2.5, GLM 4.7, Qwen, or your own local models. No vendor lock-in, no API costs.",
    color: "from-green-400 to-green-600"
  },
  {
    icon: Layers,
    title: "88 Parallel Agents",
    description: "Spawns isolated worktrees for each Linear issue. Linear Native workflow. Maximum parallelization without conflicts.",
    color: "from-green-500 to-green-700"
  },
  {
    icon: Workflow,
    title: "Linear Integration",
    description: "Auto-delegates from Linear issues. Two-way sync keeps everything in sync automatically.",
    color: "from-green-400 to-green-600"
  },
  {
    icon: GitBranch,
    title: "Git Worktree Isolation",
    description: "Each agent runs in isolated git worktrees. No merge conflicts, no context pollution.",
    color: "from-green-500 to-green-700"
  },
  {
    icon: Shield,
    title: "Full Control",
    description: "100% open source. Modify, fork, deploy however you want. Your code stays on your machines.",
    color: "from-green-400 to-green-600"
  }
];

export default function Features() {
  return (
    <section
      className="relative py-24 bg-gray-50"
      aria-labelledby="features-heading"
      itemScope
      itemType="https://schema.org/ItemList"
    >
      {/* Background decoration */}
      <div className="absolute inset-0 opacity-40">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, rgba(0, 0, 0, 0.05) 1px, transparent 0)`,
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2
            id="features-heading"
            className="text-3xl md:text-5xl font-bold text-gray-900 mb-4"
            itemProp="name"
          >
            What is better than Claude Code?
            <br />
            <span className="text-[var(--color-jianyang)] font-mono">88 Jian Yangs</span>
          </h2>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto italic">
            &ldquo;I have 88 agents. Linear Native. You make task, I ship. No sleep. No complaints. Very good deal for you.&rdquo;
          </p>
        </motion.div>

        {/* Features grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-24" role="list">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="group relative p-6 rounded-xl bg-white border border-gray-200 hover:border-[var(--color-jianyang)] transition-all duration-300 shadow-sm hover:shadow-lg hover:shadow-[var(--color-jianyang)]/5"
              role="listitem"
              itemProp="itemListElement"
              itemScope
              itemType="https://schema.org/ListItem"
            >
              <meta itemProp="position" content={String(index + 1)} />
              <div className={`inline-flex p-3 rounded-lg bg-gradient-to-br ${feature.color} mb-4 group-hover:scale-110 transition-transform duration-300 shadow-sm`}>
                <feature.icon className="w-6 h-6 text-white" />
              </div>
              <h3
                className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-[var(--color-jianyang)] transition-colors"
                itemProp="name"
              >
                {feature.title}
              </h3>
              <p
                className="text-gray-500 text-sm leading-relaxed"
                itemProp="description"
              >
                {feature.description}
              </p>

              {/* Hover glow */}
              <div className="absolute inset-0 rounded-xl bg-[var(--color-jianyang)]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
