import { ModelOverride } from '../types/index.js';

/**
 * Parser for extracting model/provider overrides from Linear issue descriptions.
 * 
 * Supports multiple tag formats:
 * - Bracket syntax: [jinyang provider: kimi model: kimi-k2.5]
 * - Shorthand: [jinyang: kimi k2.5 oath]
 * - Natural language: Use Kimi K2.5 from Moonshot OATH
 */
export class ModelParser {
  // Provider name mappings (case-insensitive)
  private readonly providerMappings: Record<string, string> = {
    'kimi': 'kimi',
    'kimioath': 'kimi',
    'kimioathcom': 'kimi',
    'moonshot': 'kimi',
    'moonshotoath': 'kimi',
    'opencode': 'opencode',
    'opencodeai': 'opencode',
    'openapi': 'opencode',
    'claude': 'anthropic',
    'claudecode': 'anthropic',
    'claude-code': 'anthropic',
    'anthropic': 'anthropic',
  };

  // Model name mappings (optional normalization)
  private readonly modelMappings: Record<string, string> = {
    'kimi-k2.5': 'kimi-k2.5',
    'kimi-k25': 'kimi-k2.5',
    'k2.5': 'kimi-k2.5',
    'k25': 'kimi-k2.5',
    'kimi-v1': 'kimi-v1',
    'glm-4-9b': 'glm-4-9b',
    'glm4': 'glm-4-9b',
    'claude-3-5-sonnet': 'claude-3-5-sonnet',
    'claude-sonnet': 'claude-3-5-sonnet',
    'claude-3-opus': 'claude-3-opus',
    'claude-opus': 'claude-3-opus',
    'claude-3-haiku': 'claude-3-haiku',
    'claude-haiku': 'claude-3-haiku',
  };

  /**
   * Parses a description string and extracts model override information.
   * 
   * @param description - The Linear issue description to parse
   * @returns ModelOverride object if match found, null otherwise
   * 
   * Test cases:
   * parse("[jinyang provider: kimi model: kimi-k2.5]")
   *   → { provider: 'kimi', model: 'kimi-k2.5' }
   * parse("[jinyang: kimi k2.5 oath]")
   *   → { provider: 'kimi', model: 'kimi-k2.5', source: 'oath' }
   * parse("Use kimi k2.5 from oath")
   *   → { provider: 'kimi', model: 'kimi-k2.5', source: 'oath' }
   * parse("[jinyang provider: opencode model: glm4 api]")
   *   → { provider: 'opencode', model: 'glm-4-9b', source: 'api' }
   * parse("[jinyang provider: claude model: claude-3-5-sonnet]")
   *   → { provider: 'anthropic', model: 'claude-3-5-sonnet' }
   * parse("Normal description without tags") → null
   * parse("") → null
   * parse(undefined) → null
   */
  parse(description?: string): ModelOverride | null {
    if (!description || description.trim() === '') {
      return null;
    }

    const normalizedDesc = description.toLowerCase();

    // Try bracket syntax: [jinyang provider: kimi model: kimi-k2.5]
    const bracketMatch = this.parseBracketSyntax(normalizedDesc);
    if (bracketMatch) {
      return bracketMatch;
    }

    // Try shorthand syntax: [jinyang: kimi k2.5 oath]
    const shorthandMatch = this.parseShorthandSyntax(normalizedDesc);
    if (shorthandMatch) {
      return shorthandMatch;
    }

    // Try natural language: Use Kimi K2.5 from Moonshot OATH
    const naturalMatch = this.parseNaturalLanguage(normalizedDesc);
    if (naturalMatch) {
      return naturalMatch;
    }

    return null;
  }

  /**
   * Parse bracket syntax: [jinyang provider: kimi model: kimi-k2.5]
   * Also supports with source: [jinyang provider: kimi model: kimi-k2.5 oath]
   */
  private parseBracketSyntax(description: string): ModelOverride | null {
    // Match pattern: [jinyang provider: <provider> model: <model> ...]
    const bracketRegex = /\[jinyang\s+provider:\s*(\S+)\s+model:\s*(\S+)(?:\s+(\S+))?\s*\]/i;
    const match = description.match(bracketRegex);

    if (match) {
      const rawProvider = match[1].toLowerCase().trim();
      const rawModel = match[2].toLowerCase().trim();
      const rawSource = match[3]?.toLowerCase().trim();

      const provider = this.normalizeProvider(rawProvider);
      const model = this.normalizeModel(rawModel);
      const source = this.normalizeSource(rawSource);

      return { provider, model, source };
    }

    return null;
  }

  /**
   * Parse shorthand syntax: [jinyang: kimi k2.5 oath]
   * Format: [jinyang: <provider> <model> <source>]
   */
  private parseShorthandSyntax(description: string): ModelOverride | null {
    // Match pattern: [jinyang: <provider> <model> <source>]
    const shorthandRegex = /\[jinyang:\s*(\S+)\s+(\S+)(?:\s+(\S+))?\s*\]/i;
    const match = description.match(shorthandRegex);

    if (match) {
      const rawProvider = match[1].toLowerCase().trim();
      const rawModelPart = match[2].toLowerCase().trim();
      const rawSource = match[3]?.toLowerCase().trim();

      const provider = this.normalizeProvider(rawProvider);
      // In shorthand, model might be partial (e.g., "k2.5" instead of "kimi-k2.5")
      const model = this.normalizeModel(`${provider}-${rawModelPart}`, rawModelPart);
      const source = this.normalizeSource(rawSource);

      return { provider, model, source };
    }

    return null;
  }

  /**
   * Parse natural language: Use Kimi K2.5 from Moonshot OATH
   * Pattern: Use|Run|Execute <Model> from|via <Provider> [OATH|API]
   */
  private parseNaturalLanguage(description: string): ModelOverride | null {
    // Pattern: use/run/execute <model> from/via <provider> [source]
    const naturalRegex = /(?:use|run|execute|deploy)\s+(?:(?:with\s+)?(?:model\s+)?)?(\S+(?:\s*[-.]?\s*\S+)?)\s+(?:from|via|on|using)\s+(\S+)(?:\s+(oath|api|subscription))?/i;
    const match = description.match(naturalRegex);

    if (match) {
      const rawModel = match[1].toLowerCase().trim().replace(/\s+/g, '-');
      const rawProvider = match[2].toLowerCase().trim();
      const rawSource = match[3]?.toLowerCase().trim();

      const provider = this.normalizeProvider(rawProvider);
      const model = this.normalizeModel(rawModel);
      const source = this.normalizeSource(rawSource);

      return { provider, model, source };
    }

    // Alternative pattern: <provider> <model> for this issue/task
    const altRegex = /(?:^|\s)(kimi|moonshot|opencode|claude|anthropic)\s+(k2\.5|kimi-k2\.5|glm-?4|claude-[^\s]+)/i;
    const altMatch = description.match(altRegex);

    if (altMatch) {
      const rawProvider = altMatch[1].toLowerCase().trim();
      const rawModel = altMatch[2].toLowerCase().trim();

      const provider = this.normalizeProvider(rawProvider);
      const model = this.normalizeModel(rawModel);

      // Try to find source in nearby text
      const sourceMatch = description.match(/\b(oath|api|subscription)\b/);
      const source = this.normalizeSource(sourceMatch?.[1]);

      return { provider, model, source };
    }

    return null;
  }

  /**
   * Normalize provider name to canonical ID
   */
  private normalizeProvider(rawProvider: string): string {
    const normalized = rawProvider.toLowerCase().trim();
    return this.providerMappings[normalized] || normalized;
  }

  /**
   * Normalize model name to canonical ID
   */
  private normalizeModel(rawModel: string, fallback?: string): string {
    const normalized = rawModel.toLowerCase().trim().replace(/\s+/g, '-');
    return this.modelMappings[normalized] || this.modelMappings[fallback || ''] || normalized;
  }

  /**
   * Normalize source to valid source type
   */
  private normalizeSource(rawSource?: string): 'oauth' | 'api' | 'subscription' | undefined {
    if (!rawSource) return undefined;

    const normalized = rawSource.toLowerCase().trim();
    if (normalized === 'oauth' || normalized === 'oath' || normalized === 'subscription') {
      return 'oauth';
    }
    if (normalized === 'api') {
      return 'api';
    }
    return undefined;
  }
}

/**
 * Singleton instance of ModelParser
 */
export const modelParser = new ModelParser();
