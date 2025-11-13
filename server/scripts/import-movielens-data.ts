import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'fs';
import { parse } from 'csv-parse';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import https from 'https';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import { extract } from 'tar';
import path from 'path';
import '../env.ts';

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Create MovieLens tables if they don't exist
async function createMovieLensTables() {
  console.log('Creating MovieLens tables...');
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS movielens_ratings (
      user_id INTEGER NOT NULL,
      movie_id INTEGER NOT NULL,
      rating REAL NOT NULL,
      timestamp BIGINT,
      PRIMARY KEY (user_id, movie_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS movielens_movies (
      movie_id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      genres TEXT
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS movielens_links (
      movie_id INTEGER PRIMARY KEY,
      imdb_id TEXT,
      tmdb_id INTEGER
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS movielens_tags (
      user_id INTEGER NOT NULL,
      movie_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      timestamp BIGINT
    );
  `);

  console.log('MovieLens tables created successfully!');
}

async function downloadMovieLens(url: string, outputPath: string): Promise<void> {
  console.log(`Downloading MovieLens dataset from ${url}...`);
  
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadMovieLens(redirectUrl, outputPath).then(resolve).catch(reject);
        } else {
          reject(new Error('Redirect without location'));
        }
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      const fileStream = createWriteStream(outputPath);
      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        console.log('Download complete!');
        resolve();
      });

      fileStream.on('error', (err) => {
        reject(err);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function extractTarGz(tarPath: string, extractPath: string): Promise<void> {
  console.log(`Extracting ${tarPath} to ${extractPath}...`);
  
  if (!existsSync(extractPath)) {
    mkdirSync(extractPath, { recursive: true });
  }

  await pipeline(
    createReadStream(tarPath),
    createGunzip(),
    extract({ cwd: extractPath })
  );

  console.log('Extraction complete!');
}

async function importMovieLensRatings(csvPath: string, batchSize: number = 5000) {
  console.log(`Importing ratings from ${csvPath}...`);
  
  let batch: any[] = [];
  let totalProcessed = 0;

  const parser = createReadStream(csvPath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
    })
  );

  const insertBatch = async (records: any[]) => {
    if (records.length === 0) return;

    const values = records
      .map((r, idx) => {
        const offset = idx * 4;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
      })
      .join(', ');

    const params = records.flatMap(r => [
      parseInt(r.userId),
      parseInt(r.movieId),
      parseFloat(r.rating),
      r.timestamp ? parseInt(r.timestamp) : null,
    ]);

    const query = `
      INSERT INTO movielens_ratings (user_id, movie_id, rating, timestamp)
      VALUES ${values}
      ON CONFLICT (user_id, movie_id) DO NOTHING
    `;

    await pool.query(query, params);
  };

  for await (const row of parser) {
    batch.push(row);
    totalProcessed++;

    if (batch.length >= batchSize) {
      await insertBatch(batch);
      console.log(`Ratings processed: ${totalProcessed.toLocaleString()}`);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await insertBatch(batch);
  }

  console.log(`Total ratings imported: ${totalProcessed.toLocaleString()}`);
}

async function importMovieLensMovies(csvPath: string, batchSize: number = 1000) {
  console.log(`Importing movies from ${csvPath}...`);
  
  let batch: any[] = [];
  let totalProcessed = 0;

  const parser = createReadStream(csvPath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
    })
  );

  const insertBatch = async (records: any[]) => {
    if (records.length === 0) return;

    const values = records
      .map((r, idx) => {
        const offset = idx * 3;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
      })
      .join(', ');

    const params = records.flatMap(r => [
      parseInt(r.movieId),
      r.title,
      r.genres || null,
    ]);

    const query = `
      INSERT INTO movielens_movies (movie_id, title, genres)
      VALUES ${values}
      ON CONFLICT (movie_id) DO UPDATE SET title = EXCLUDED.title, genres = EXCLUDED.genres
    `;

    await pool.query(query, params);
  };

  for await (const row of parser) {
    batch.push(row);
    totalProcessed++;

    if (batch.length >= batchSize) {
      await insertBatch(batch);
      console.log(`Movies processed: ${totalProcessed.toLocaleString()}`);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await insertBatch(batch);
  }

  console.log(`Total movies imported: ${totalProcessed.toLocaleString()}`);
}

async function importMovieLensLinks(csvPath: string, batchSize: number = 1000) {
  console.log(`Importing links from ${csvPath}...`);
  
  let batch: any[] = [];
  let totalProcessed = 0;

  const parser = createReadStream(csvPath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
    })
  );

  const insertBatch = async (records: any[]) => {
    if (records.length === 0) return;

    const values = records
      .map((r, idx) => {
        const offset = idx * 3;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
      })
      .join(', ');

    const params = records.flatMap(r => [
      parseInt(r.movieId),
      r.imdbId || null,
      r.tmdbId ? parseInt(r.tmdbId) : null,
    ]);

    const query = `
      INSERT INTO movielens_links (movie_id, imdb_id, tmdb_id)
      VALUES ${values}
      ON CONFLICT (movie_id) DO UPDATE SET imdb_id = EXCLUDED.imdb_id, tmdb_id = EXCLUDED.tmdb_id
    `;

    await pool.query(query, params);
  };

  for await (const row of parser) {
    batch.push(row);
    totalProcessed++;

    if (batch.length >= batchSize) {
      await insertBatch(batch);
      console.log(`Links processed: ${totalProcessed.toLocaleString()}`);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await insertBatch(batch);
  }

  console.log(`Total links imported: ${totalProcessed.toLocaleString()}`);
}

async function main() {
  const dataDir = './attached_assets/movielens';
  const tarPath = path.join(dataDir, 'ml-latest-small.tar.gz');
  const extractPath = dataDir;
  
  // Download MovieLens Latest Small (100K ratings - good for quick training)
  const downloadUrl = 'https://files.grouplens.org/datasets/movielens/ml-latest-small.zip';
  
  console.log('Starting MovieLens import process...');
  
  // Create tables
  await createMovieLensTables();
  
  // Create directory if it doesn't exist
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // Check if data already exists
  const mlDataPath = path.join(extractPath, 'ml-latest-small');
  
  if (!existsSync(mlDataPath)) {
    console.log('MovieLens data not found locally. Please download manually from:');
    console.log('https://files.grouplens.org/datasets/movielens/ml-latest-small.zip');
    console.log('Extract it to:', dataDir);
    process.exit(1);
  }

  // Import data
  const ratingsPath = path.join(mlDataPath, 'ratings.csv');
  const moviesPath = path.join(mlDataPath, 'movies.csv');
  const linksPath = path.join(mlDataPath, 'links.csv');

  if (existsSync(ratingsPath)) {
    await importMovieLensRatings(ratingsPath);
  }

  if (existsSync(moviesPath)) {
    await importMovieLensMovies(moviesPath);
  }

  if (existsSync(linksPath)) {
    await importMovieLensLinks(linksPath);
  }

  await pool.end();
  console.log('\n=== MovieLens Import Complete ===');
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
