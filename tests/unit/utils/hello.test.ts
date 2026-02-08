import { describe, it, expect } from 'vitest';
import { greet } from '../../../src/utils/hello.js';

describe('hello utils', () => {
  it('should greet with name', () => {
    expect(greet('World')).toBe('Hello, World!');
  });
});
