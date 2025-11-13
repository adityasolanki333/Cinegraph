import dotenv from "dotenv";
import { readFileSync } from "fs";

// Store DATABASE_URL from Replit if it exists before dotenv overwrites it
const replitDatabaseUrl = process.env.DATABASE_URL;

// First pass: Check if Replit secrets are empty
const replitSecretsEmpty = !process.env.TMDB_API_KEY?.trim() || !process.env.GEMINI_API_KEY?.trim();

// If Replit secrets are empty, use override mode to force .env values
if (replitSecretsEmpty) {
  dotenv.config({ override: true });
} else {
  dotenv.config();
}

// Restore DATABASE_URL from Replit if it was set (don't let .env override it)
if (replitDatabaseUrl && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = replitDatabaseUrl;
}

// Fallback: Double-check and manually override any empty env vars from .env file
const envVarsToCheck = ['TMDB_API_KEY', 'GEMINI_API_KEY', 'RAPIDAPI_KEY'];
try {
  const envFile = dotenv.parse(readFileSync('.env'));
  envVarsToCheck.forEach(key => {
    if (!process.env[key]?.trim() && envFile[key]) {
      process.env[key] = envFile[key];
      console.log(`Loaded ${key} from .env file`);
    }
  });
} catch (error) {
  // .env file doesn't exist, which is fine
}
