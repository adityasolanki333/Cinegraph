import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from "ws";
import dotenv from "dotenv";

dotenv.config();

neonConfig.webSocketConstructor = ws;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function createDiversityMetricsTable() {
  console.log('Creating diversity_metrics table if not exists...');
  
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS diversity_metrics (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id),
        session_id VARCHAR,
        recommendation_type TEXT NOT NULL,
        intra_diversity REAL,
        genre_balance REAL,
        serendipity_score REAL,
        exploration_rate REAL,
        coverage_score REAL,
        diversity_config JSONB,
        recommendation_count INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    console.log('diversity_metrics table created successfully!');
  } catch (error) {
    console.error('Error creating diversity_metrics table:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

createDiversityMetricsTable();
