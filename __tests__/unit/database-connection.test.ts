import { describe, expect, it, beforeEach, vi } from 'vitest';

class FakePool {
  public readonly listeners: Record<string, Array<(error: Error) => void>> = {};
  public readonly options: Record<string, unknown>;
  public ended = false;

  constructor(options: Record<string, unknown>) {
    this.options = options;
  }

  on(event: string, handler: (error: Error) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(handler);
  }

  async end() {
    this.ended = true;
  }
}

let lastPool: FakePool | null = null;
const poolCtor = vi.fn((options: Record<string, unknown>) => {
  lastPool = new FakePool(options);
  return lastPool as unknown as FakePool;
});

vi.mock('pg', () => ({
  Pool: poolCtor,
}));

describe('DatabaseConnection', () => {
  beforeEach(() => {
    vi.resetModules();
    poolCtor.mockClear();
    lastPool = null;
  });

  it('creates a pool with the provided configuration', async () => {
    const { db } = await import('../../config/database');

    const pool = db.connect({
      host: 'localhost',
      port: 5432,
      database: 'test-db',
      user: 'tester',
      password: 'secret',
      ssl: false,
      maxConnections: 10,
    });

    expect(poolCtor).toHaveBeenCalledTimes(1);
    expect(lastPool?.options).toMatchObject({
      host: 'localhost',
      port: 5432,
      database: 'test-db',
      user: 'tester',
      password: 'secret',
      max: 10,
    });
    expect(pool).toBe(lastPool);
  });

  it('reuses the existing pool on repeated connects', async () => {
    const { db } = await import('../../config/database');

    const first = db.connect({
      host: 'localhost',
      port: 5432,
      database: 'test-db',
      user: 'tester',
      password: 'secret',
      ssl: false,
    });

    const second = db.connect({
      host: 'ignored',
      port: 1234,
      database: 'ignored',
      user: 'ignored',
      password: 'ignored',
      ssl: true,
    });

    expect(poolCtor).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('throws when accessing pool before connecting', async () => {
    const { db } = await import('../../config/database');

    await expect(() => db.getPool()).toThrowError('Database not connected');
  });

  it('disconnects and clears the pool', async () => {
    const { db } = await import('../../config/database');

    db.connect({
      host: 'localhost',
      port: 5432,
      database: 'test-db',
      user: 'tester',
      password: 'secret',
      ssl: false,
    });

    await db.disconnect();

    expect(lastPool?.ended).toBe(true);

    db.connect({
      host: 'localhost',
      port: 5432,
      database: 'test-db',
      user: 'tester',
      password: 'secret',
      ssl: false,
    });

    expect(poolCtor).toHaveBeenCalledTimes(2);
  });
});
