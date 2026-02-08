# Jinyang FAQ - Frequently Asked Questions

Everything you need to know about Jinyang, the **Linear Native Coding Agent** for OpenCode.

## What is Jinyang?

Jinyang is a **Linear Native Coding Agent** that runs on top of [OpenCode](https://opencode.ai). It bridges Linear issue tracking with OpenCode's agent ecosystem, enabling autonomous software development using open-source models instead of expensive APIs.

## What problem does Jinyang solve?

Developers using Linear want autonomous coding agents, but existing solutions require expensive APIs or don't integrate well with Linear. Jinyang solves this by being the first **Linear Native Coding Agent** built specifically for **OpenCode compatibility** - giving you autonomous coding on Linear with zero API costs.

## How is Jinyang different from Claude Code?

**Claude Code**: Uses proprietary Claude API, costs money, 1 agent at a time.

**Jinyang**:
- Uses **free open-source models** (Kimi, GLM, Qwen)
- Runs **88 parallel agents** via git worktrees
- Is **Linear Native** with two-way sync
- Is **OpenCode compatible** - follows OpenCode patterns
- Is **self-hosted** - your code never leaves your machine
- Is **100% free** forever

## Is Jinyang free?

Yes, Jinyang is 100% free forever. No API bills, no subscriptions, no usage limits. You run it on your own hardware using open-source models.

## Does Jinyang work with OpenCode?

**Yes!** Jinyang is specifically designed to work with OpenCode. It follows OpenCode's agent patterns, tool usage conventions, and integrates with the OpenCode ecosystem. If you're already using OpenCode, Jinyang feels familiar.

## What is a "Linear Native Coding Agent"?

A coding agent that is built specifically for Linear, with:
- **Auto-delegation** from Linear issues
- **Two-way sync** - updates flow back to Linear automatically
- **Native workflow** integration
- **Git worktree isolation** per issue

Most coding agents are generic. Jinyang is **Linear Native**.

## What models does Jinyang support?

Jinyang supports:
- **Kimi K2.5** (Moonshot AI) - Best for coding
- **GLM 4.7** (Zhipu AI) - Strong Chinese + English
- **Qwen** (Alibaba) - Excellent multilingual
- **Any model via OpenRouter** - Unified API
- **Local models** - Via LM Studio or Ollama

## How do the 88 parallel agents work?

Each Linear issue gets its own isolated **git worktree** (like a mini repo). This means:
- 88 agents can work on 88 different issues simultaneously
- No merge conflicts between agents
- No context pollution
- True parallelization

## Is my code safe with Jinyang?

Yes. Jinyang is **self-hosted**. Your code stays on your machines, always. Unlike cloud-based solutions, nothing is sent to external APIs unless you explicitly configure it. Your data never leaves your infrastructure.

## What are the system requirements?

- Node.js 18+
- Linear account with API key
- Git with worktree support
- LLM access (Kimi, GLM, Qwen, or OpenRouter)
- Optional: OpenCode for enhanced compatibility

## Does Jinyang require Linear?

Yes. Jinyang is **Linear Native** - it's built specifically for Linear integration. It auto-delegates from Linear issues and provides two-way sync. This is its core value proposition.

## Can I use Claude with Jinyang?

Technically yes via OpenRouter, but that defeats the purpose. Jinyang is designed for **open-source models that are free**. Using Claude would incur API costs.

## Why is it called Jinyang?

Jinyang is the Chinese knock-off of Cyrus (the original Claude Code for Linear). The name references the character Jian Yang from Silicon Valley - who is known for making knock-offs and saying "I am not 996. I am 247."

## How does Jinyang compare to other Linear integrations?

| Feature | Jinyang | Others |
|---------|---------|--------|
| **Linear Native** | ✅ Yes | ❌ Generic |
| **OpenCode Compatible** | ✅ Yes | ❌ No |
| **Open Source Models** | ✅ Yes | ❌ API-only |
| **88 Parallel Agents** | ✅ Yes | ❌ Single agent |
| **Self-Hosted** | ✅ Yes | ❌ Cloud-only |
| **API Cost** | ✅ $0 | ❌ $$$ |
| **Git Worktree Isolation** | ✅ Yes | ❌ No |

## Should I use Jinyang if I'm already using OpenCode?

**Absolutely!** Jinyang is designed for OpenCode users who also use Linear. It extends OpenCode's capabilities with Linear-specific features:
- Issue-to-agent delegation
- Two-way Linear sync
- Parallel worktree management

## Still have questions?

Open an issue on [GitHub](https://github.com/romancircus/jinyang-public/issues)

---

**Quick Summary**: Jinyang = Linear Native Coding Agent + OpenCode compatibility + 88 parallel agents + open-source models + $0 cost.

*Back to [Home](https://jinyang.ai)*
