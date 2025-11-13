import { pool } from "./db";
import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

/**
 * Initialize database tables that might be missing
 * This runs on server startup to ensure all required tables exist
 */
export async function initializeDatabase() {
  try {
    console.log('Checking database tables...');
    
    // Add password column if it doesn't exist
    try {
      await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password VARCHAR;
      `);
      console.log('✓ Password column ensured in users table');
    } catch (error) {
      console.log('Password column check:', error);
    }
    
    // Create diversity_metrics table if it doesn't exist
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
    
    // Create demo user if it doesn't exist
    await createDemoUser();
    
    // Create guest user if it doesn't exist (fixes foreign key violations)
    await ensureGuestUser();
    
    console.log('✓ Database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database tables:', error);
    // Don't throw - allow app to start even if table creation fails
  }
}

async function createDemoUser() {
  try {
    const demoEmail = "demo@movieapp.com";
    
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, demoEmail))
      .limit(1);
    
    if (!existingUser) {
      const hashedPassword = await bcrypt.hash("demo123", 10);
      
      await db.insert(users).values({
        email: demoEmail,
        password: hashedPassword,
        firstName: "Demo",
        lastName: "User",
        bio: "Demo user for testing the application",
      });
      
      console.log('✓ Demo user created (email: demo@movieapp.com, password: demo123)');
    } else if (!existingUser.password) {
      // Update existing demo user with password if missing
      const hashedPassword = await bcrypt.hash("demo123", 10);
      
      await db
        .update(users)
        .set({ password: hashedPassword })
        .where(eq(users.email, demoEmail));
      
      console.log('✓ Demo user password updated (email: demo@movieapp.com, password: demo123)');
    }
  } catch (error) {
    console.error('Error creating demo user:', error);
  }
}

async function ensureGuestUser() {
  try {
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, 'guest'))
      .limit(1);
    
    if (!existingUser) {
      await db.insert(users).values({
        id: 'guest',
        email: 'guest@cinegraph.app',
        firstName: 'Guest',
        lastName: 'User',
        bio: 'Guest user for anonymous browsing'
      });
      
      console.log('✓ Guest user created (ID: guest)');
    }
  } catch (error) {
    console.error('Error creating guest user:', error);
  }
}
