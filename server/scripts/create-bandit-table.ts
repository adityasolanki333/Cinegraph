import '../env';
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function createBanditTable() {
  try {
    console.log('Creating bandit_experiments table...');
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS bandit_experiments (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id),
        experiment_type TEXT NOT NULL,
        arm_chosen TEXT NOT NULL,
        reward REAL,
        context JSONB,
        exploration_rate REAL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    console.log('✅ bandit_experiments table created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating table:', error);
    process.exit(1);
  }
}

createBanditTable();
