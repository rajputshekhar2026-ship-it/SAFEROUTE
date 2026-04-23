// src/config/database.ts

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { logger } from '../utils/logger';

// Database configuration interface
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
}

// Parse database URL or use individual parameters
const parseDatabaseConfig = (): DatabaseConfig => {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (databaseUrl) {
    // Parse PostgreSQL connection string
    const url = new URL(databaseUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port || '5432'),
      database: url.pathname.slice(1),
      user: url.username,
      password: url.password,
      ssl: url.searchParams.get('sslmode') === 'require' ? { rejectUnauthorized: false } : false,
      max: parseInt(process.env.DB_POOL_MAX || '20'),
      idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
      connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '2000'),
    };
  }
  
  // Use individual environment variables
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'saferoute',
    user: process.env.DB_USER || 'saferoute_user',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: parseInt(process.env.DB_POOL_MAX || '20'),
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT || '30000'),
    connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT || '2000'),
  };
};

// Create connection pool
const config = parseDatabaseConfig();
const pool = new Pool(config);

// Pool event handlers
pool.on('connect', () => {
  logger.info('PostgreSQL pool: New client connected');
});

pool.on('error', (err: Error) => {
  logger.error('PostgreSQL pool: Unexpected error on idle client', err);
  process.exit(-1);
});

pool.on('acquire', () => {
  logger.debug('PostgreSQL pool: Client acquired');
});

pool.on('remove', () => {
  logger.debug('PostgreSQL pool: Client removed');
});

// Test database connection
export const testConnection = async (): Promise<boolean> => {
  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT NOW() as time, version() as version, postgis_version() as postgis');
    logger.info('Database connection successful', {
      time: result.rows[0].time,
      postgis: result.rows[0].postgis,
    });
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    return false;
  } finally {
    if (client) client.release();
  }
};

// Query helper with logging and error handling
export const query = async <T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> => {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    
    // Log slow queries (more than 100ms)
    if (duration > 100) {
      logger.warn('Slow query detected', {
        duration: `${duration}ms`,
        query: text.substring(0, 500),
        params: params?.slice(0, 10),
      });
    } else {
      logger.debug('Query executed', {
        duration: `${duration}ms`,
        query: text.substring(0, 200),
        rowCount: result.rowCount,
      });
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error('Query failed', {
      duration: `${duration}ms`,
      query: text.substring(0, 500),
      params: params?.slice(0, 10),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

// Transaction helper
export const transaction = async <T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Get client from pool
export const getClient = async (): Promise<PoolClient> => {
  return await pool.connect();
};

// Execute multiple queries in parallel
export const parallelQueries = async <T>(
  queries: Array<{ text: string; params?: any[] }>
): Promise<QueryResult<T>[]> => {
  const clients: PoolClient[] = [];
  try {
    const results = await Promise.all(
      queries.map(async ({ text, params }) => {
        const client = await pool.connect();
        clients.push(client);
        return client.query<T>(text, params);
      })
    );
    return results;
  } finally {
    clients.forEach(client => client.release());
  }
};

// Batch insert helper
export const batchInsert = async <T>(
  tableName: string,
  columns: string[],
  values: any[][],
  batchSize: number = 100
): Promise<number> => {
  let insertedCount = 0;
  
  for (let i = 0; i < values.length; i += batchSize) {
    const batch = values.slice(i, i + batchSize);
    const placeholders = batch
      .map((_, rowIndex) => `(${columns.map((_, colIndex) => `$${rowIndex * columns.length + colIndex + 1}`).join(', ')})`)
      .join(', ');
    
    const flatValues = batch.flat();
    const query = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES ${placeholders}
      RETURNING *
    `;
    
    const result = await pool.query(query, flatValues);
    insertedCount += result.rowCount || 0;
  }
  
  return insertedCount;
};

// Health check function
export const healthCheck = async (): Promise<{
  status: 'healthy' | 'unhealthy';
  latency: number;
  version?: string;
  postgis?: string;
}> => {
  const start = Date.now();
  try {
    const result = await pool.query('SELECT version() as version, postgis_version() as postgis');
    const latency = Date.now() - start;
    return {
      status: 'healthy',
      latency,
      version: result.rows[0].version,
      postgis: result.rows[0].postgis,
    };
  } catch (error) {
    const latency = Date.now() - start;
    logger.error('Database health check failed:', error);
    return {
      status: 'unhealthy',
      latency,
    };
  }
};

// Get pool statistics
export const getPoolStats = (): {
  total: number;
  idle: number;
  waiting: number;
} => {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
};

// Close all connections (for graceful shutdown)
export const closePool = async (): Promise<void> => {
  try {
    await pool.end();
    logger.info('PostgreSQL pool closed successfully');
  } catch (error) {
    logger.error('Error closing PostgreSQL pool:', error);
    throw error;
  }
};

// Initialize database with extensions and schema
export const initializeDatabase = async (): Promise<void> => {
  try {
    // Enable required extensions
    await query('CREATE EXTENSION IF NOT EXISTS postgis;');
    await query('CREATE EXTENSION IF NOT EXISTS postgis_topology;');
    await query('CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;');
    await query('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    await query('CREATE EXTENSION IF NOT EXISTS btree_gist;');
    
    logger.info('Database extensions enabled successfully');
    
    // Check if tables exist, if not create them
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'routes', 'reports')
    `);
    
    if (tables.rows.length === 0) {
      logger.warn('No tables found. Please run migrations: npm run migrate');
    } else {
      logger.info(`Found ${tables.rows.length} existing tables`);
    }
    
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
};

// Graceful shutdown handler
export const setupGracefulShutdown = (): void => {
  const shutdown = async () => {
    logger.info('Received shutdown signal, closing database connections...');
    await closePool();
    process.exit(0);
  };
  
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

// Export pool for advanced use cases
export default pool;
