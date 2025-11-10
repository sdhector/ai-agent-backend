import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockPool, createQueryResult } from '../helpers';

let currentPool: MockPool;
const poolCtor = vi.fn(() => {
  currentPool = new MockPool();
  return currentPool as unknown as MockPool;
});

vi.mock('pg', () => ({
  Pool: poolCtor,
}));

describe('Database pool lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    poolCtor.mockReset();
    currentPool = new MockPool();
    poolCtor.mockImplementation(() => currentPool as unknown as MockPool);
  });

  it('registers error handlers on the pool', async () => {
    const { db } = await import('../../config/database');

    db.connect({
      host: 'localhost',
      port: 5432,
      database: 'test-db',
      user: 'tester',
      password: 'secret',
      ssl: false,
    });

    expect(currentPool.errorHandlers.length).toBeGreaterThanOrEqual(1);
    expect(() => currentPool.emitError(new Error('connection lost'))).not.toThrow();
  });

  it('supports running queries through the shared pool', async () => {
    currentPool.addHandler((sql) => {
      if (sql.trim().startsWith('SELECT 1')) {
        return createQueryResult([{ result: 1 }]);
      }
      return undefined as any;
    });

    const { db } = await import('../../config/database');
    const pool = db.connect({
      host: 'localhost',
      port: 5432,
      database: 'test-db',
      user: 'tester',
      password: 'secret',
      ssl: false,
    }) as unknown as MockPool;

    const result = await pool.query('SELECT 1');
    expect(result.rows[0].result).toBe(1);
  });

  it('cleans up the pool on disconnect', async () => {
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

    expect(currentPool.ended).toBe(true);
  });
});
