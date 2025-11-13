import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import '../env.ts';

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

interface TMDBRow {
  id: string;
  title: string;
  vote_average: string;
  vote_count: string;
  status: string;
  release_date: string;
  revenue: string;
  runtime: string;
  budget: string;
  imdb_id: string;
  original_language: string;
  original_title: string;
  overview: string;
  popularity: string;
  tagline: string;
  genres: string;
  production_companies: string;
  production_countries: string;
  spoken_languages: string;
  cast: string;
  director: string;
  director_of_photography: string;
  writers: string;
  producers: string;
  music_composer: string;
  imdb_rating: string;
  imdb_votes: string;
  poster_path: string;
}

function parseFloatOrNull(value: string): number | null {
  if (!value || value === '' || value === 'null' || value === 'NaN') return null;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? null : parsed;
}

function parseIntOrNull(value: string): number | null {
  if (!value || value === '' || value === 'null') return null;
  const parsed = parseInt(value);
  return isNaN(parsed) ? null : parsed;
}

async function createTable() {
  console.log('Creating tmdb_training_data table if not exists...');
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tmdb_training_data (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      original_title TEXT,
      vote_average REAL,
      vote_count REAL,
      status TEXT,
      release_date TEXT,
      revenue REAL,
      runtime REAL,
      budget REAL,
      imdb_id TEXT,
      original_language TEXT,
      overview TEXT,
      popularity REAL,
      tagline TEXT,
      genres TEXT,
      production_companies TEXT,
      production_countries TEXT,
      spoken_languages TEXT,
      "cast" TEXT,
      director TEXT,
      director_of_photography TEXT,
      writers TEXT,
      producers TEXT,
      music_composer TEXT,
      imdb_rating REAL,
      imdb_votes REAL,
      poster_path TEXT
    );
  `);

  // Create indexes
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tmdb_genres ON tmdb_training_data(genres);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tmdb_popularity ON tmdb_training_data(popularity);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_tmdb_release_date ON tmdb_training_data(release_date);`);
  
  console.log('Table created successfully!');
}

async function importTMDBData(csvPath: string, batchSize: number = 1000) {
  console.log('Starting TMDB data import...');
  console.log(`Reading from: ${csvPath}`);
  
  let batch: any[] = [];
  let totalProcessed = 0;
  let totalInserted = 0;
  let totalErrors = 0;

  const parser = createReadStream(csvPath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
    })
  );

  const insertBatch = async (records: any[]) => {
    if (records.length === 0) return;

    try {
      // Build INSERT query with ON CONFLICT DO NOTHING to avoid duplicates
      const values = records
        .map((r, idx) => {
          const offset = idx * 28;
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13}, $${offset + 14}, $${offset + 15}, $${offset + 16}, $${offset + 17}, $${offset + 18}, $${offset + 19}, $${offset + 20}, $${offset + 21}, $${offset + 22}, $${offset + 23}, $${offset + 24}, $${offset + 25}, $${offset + 26}, $${offset + 27}, $${offset + 28})`;
        })
        .join(', ');

      const params = records.flatMap(r => [
        r.id,
        r.title,
        r.original_title,
        r.vote_average,
        r.vote_count,
        r.status,
        r.release_date,
        r.revenue,
        r.runtime,
        r.budget,
        r.imdb_id,
        r.original_language,
        r.overview,
        r.popularity,
        r.tagline,
        r.genres,
        r.production_companies,
        r.production_countries,
        r.spoken_languages,
        r.cast,
        r.director,
        r.director_of_photography,
        r.writers,
        r.producers,
        r.music_composer,
        r.imdb_rating,
        r.imdb_votes,
        r.poster_path,
      ]);

      const query = `
        INSERT INTO tmdb_training_data (
          id, title, original_title, vote_average, vote_count, status, 
          release_date, revenue, runtime, budget, imdb_id, original_language,
          overview, popularity, tagline, genres, production_companies,
          production_countries, spoken_languages, "cast", director,
          director_of_photography, writers, producers, music_composer,
          imdb_rating, imdb_votes, poster_path
        )
        VALUES ${values}
        ON CONFLICT (id) DO NOTHING
      `;

      await pool.query(query, params);
      totalInserted += records.length;
    } catch (err: any) {
      console.error(`Error inserting batch: ${err.message}`);
      totalErrors += records.length;
    }
  };

  for await (const row of parser) {
    const record = row as TMDBRow;
    
    // Transform and clean data
    const transformedRecord = {
      id: parseIntOrNull(record.id),
      title: record.title || null,
      original_title: record.original_title || null,
      vote_average: parseFloatOrNull(record.vote_average),
      vote_count: parseFloatOrNull(record.vote_count),
      status: record.status || null,
      release_date: record.release_date || null,
      revenue: parseFloatOrNull(record.revenue),
      runtime: parseFloatOrNull(record.runtime),
      budget: parseFloatOrNull(record.budget),
      imdb_id: record.imdb_id || null,
      original_language: record.original_language || null,
      overview: record.overview || null,
      popularity: parseFloatOrNull(record.popularity),
      tagline: record.tagline || null,
      genres: record.genres || null,
      production_companies: record.production_companies || null,
      production_countries: record.production_countries || null,
      spoken_languages: record.spoken_languages || null,
      cast: record.cast || null,
      director: record.director || null,
      director_of_photography: record.director_of_photography || null,
      writers: record.writers || null,
      producers: record.producers || null,
      music_composer: record.music_composer || null,
      imdb_rating: parseFloatOrNull(record.imdb_rating),
      imdb_votes: parseFloatOrNull(record.imdb_votes),
      poster_path: record.poster_path || null,
    };

    // Skip records with invalid IDs
    if (transformedRecord.id === null || transformedRecord.id === 0) {
      totalErrors++;
      continue;
    }

    batch.push(transformedRecord);
    totalProcessed++;

    if (batch.length >= batchSize) {
      await insertBatch(batch);
      console.log(`Processed: ${totalProcessed.toLocaleString()} | Inserted: ${totalInserted.toLocaleString()} | Errors: ${totalErrors}`);
      batch = [];
    }
  }

  // Insert remaining records
  if (batch.length > 0) {
    await insertBatch(batch);
  }

  console.log('\n=== Import Complete ===');
  console.log(`Total Processed: ${totalProcessed.toLocaleString()}`);
  console.log(`Total Inserted: ${totalInserted.toLocaleString()}`);
  console.log(`Total Errors: ${totalErrors}`);

  await pool.end();
}

// Run the import
const csvPath = process.argv[2] || './attached_assets/extracted/TMDB_all_movies.csv';

async function main() {
  await createTable();
  await importTMDBData(csvPath, 500);
}

main()
  .then(() => {
    console.log('Import finished successfully!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
  });
