import { describe, expect, it } from 'vitest';

describe('test environment', () => {
  it('applies the vitest env overrides', () => {
    expect(process.env.NODE_ENV).toBe('test');
    expect(process.env.LOG_LEVEL).toBe('silent');
    expect(process.env.DATABASE_URL).toMatch(/^postgres:\/\//);
  });
});
