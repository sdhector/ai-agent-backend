import { vi } from 'vitest';
import type { PoolClient, QueryResult } from 'pg';

type QueryHandler = (sql: string, params?: any[]) => Promise<QueryResult> | QueryResult;

type EventHandler = (error: Error) => void;

export class MockPool {
  public readonly queryCalls: Array<{ sql: string; params?: any[] }> = [];
  public readonly handlers: QueryHandler[] = [];
  public readonly errorHandlers: EventHandler[] = [];
  public ended = false;

  constructor(handler?: QueryHandler | QueryHandler[]) {
    if (handler) {
      this.handlers.push(...(Array.isArray(handler) ? handler : [handler]));
    }
  }

  on(event: string, handler: EventHandler) {
    if (event === 'error') {
      this.errorHandlers.push(handler);
    }
  }

  emitError(error: Error) {
    for (const handler of this.errorHandlers) {
      handler(error);
    }
  }

  addHandler(handler: QueryHandler) {
    this.handlers.push(handler);
  }

  async query(sql: string, params?: any[]): Promise<QueryResult> {
    this.queryCalls.push({ sql, params });
    for (const handler of this.handlers) {
      const result = await handler(sql, params);
      if (result) {
        return result;
      }
    }
    return { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] } as QueryResult;
  }

  async connect(): Promise<PoolClient> {
    return {
      release: vi.fn(),
      query: this.query.bind(this),
    } as unknown as PoolClient;
  }

  async end(): Promise<void> {
    this.ended = true;
  }
}

export function createQueryResult<T extends Record<string, any>>(rows: T[]): QueryResult<T> {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  } as QueryResult<T>;
}

export function mockDatabaseModule(pool: MockPool) {
  return {
    db: {
      connect: vi.fn(() => pool),
      getPool: vi.fn(() => pool),
      disconnect: vi.fn(() => pool.end()),
    },
  };
}
