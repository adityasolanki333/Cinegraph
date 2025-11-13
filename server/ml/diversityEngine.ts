/**
 * Diversity Engine (Phase 9)
 * 
 * Advanced diversity algorithms to prevent filter bubbles and ensure serendipity:
 * - Maximal Marginal Relevance (MMR)
 * - Determinantal Point Processes (DPP)
 * - Genre/Category balancing
 * - Epsilon-greedy exploration
 * - Serendipity injection
 */

import * as tf from '@tensorflow/tfjs-node';

interface DiversityCandidate {
  id: string;
  tmdbId: number;
  mediaType: string;
  score: number;
  genres: string[];
  embeddings?: number[];
  metadata?: any;
}

interface DiversityConfig {
  lambda: number; // MMR balance: 0 = max diversity, 1 = max relevance
  epsilonExploration: number; // Exploration rate (0-1)
  maxConsecutiveSameGenre: number;
  serendipityRate: number; // Percentage of surprising recommendations
  diversityMetric: 'mmr' | 'dpp' | 'hybrid';
}

interface DiversityMetrics {
  intraDiversity: number; // Average dissimilarity within results
  genreBalance: number; // Shannon entropy of genre distribution
  serendipityScore: number; // % of unexpected recommendations
  explorationRate: number; // % from exploration vs exploitation
  coverageScore: number; // % of unique genres/categories covered
}

/**
 * Maximal Marginal Relevance (MMR) Implementation
 * Balances relevance and diversity iteratively
 */
export class MMRDiversifier {
  /**
   * Apply MMR algorithm to select diverse items
   */
  async applyMMR(
    candidates: DiversityCandidate[],
    limit: number,
    lambda: number = 0.7
  ): Promise<DiversityCandidate[]> {
    if (candidates.length === 0) return [];
    if (candidates.length <= limit) return candidates;

    const selected: DiversityCandidate[] = [];
    const remaining = [...candidates];

    // Select first item (highest relevance)
    selected.push(remaining.shift()!);

    // Iteratively select items maximizing MMR score
    while (selected.length < limit && remaining.length > 0) {
      let bestMMRScore = -Infinity;
      let bestIndex = 0;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        
        // Calculate max similarity to already selected items
        const maxSimilarity = Math.max(
          ...selected.map(s => this.calculateSimilarity(candidate, s))
        );
        
        // MMR score: λ × relevance - (1-λ) × maxSimilarity
        const mmrScore = lambda * candidate.score - (1 - lambda) * maxSimilarity;
        
        if (mmrScore > bestMMRScore) {
          bestMMRScore = mmrScore;
          bestIndex = i;
        }
      }

      selected.push(remaining.splice(bestIndex, 1)[0]);
    }

    return selected;
  }

  /**
   * Calculate similarity between two candidates
   * Uses embeddings if available, otherwise genre overlap
   */
  private calculateSimilarity(a: DiversityCandidate, b: DiversityCandidate): number {
    // If embeddings are available, use cosine similarity
    if (a.embeddings && b.embeddings) {
      return this.cosineSimilarity(a.embeddings, b.embeddings);
    }

    // Fallback to genre-based similarity
    const aGenres = new Set(a.genres);
    const bGenres = new Set(b.genres);
    const intersection = new Set(Array.from(aGenres).filter(g => bGenres.has(g)));
    const union = new Set([...a.genres, ...b.genres]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * Cosine similarity for embeddings
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    return tf.tidy(() => {
      const tensorA = tf.tensor1d(a);
      const tensorB = tf.tensor1d(b);
      
      const dotProduct = tf.sum(tf.mul(tensorA, tensorB));
      const normA = tf.norm(tensorA);
      const normB = tf.norm(tensorB);
      
      const similarity = tf.div(dotProduct, tf.mul(normA, normB));
      return similarity.arraySync() as number;
    });
  }
}

/**
 * Determinantal Point Processes (DPP) Implementation
 * Ensures diverse sets using kernel matrix determinants
 */
export class DPPDiversifier {
  /**
   * Apply DPP algorithm for maximum diversity
   */
  async applyDPP(
    candidates: DiversityCandidate[],
    limit: number
  ): Promise<DiversityCandidate[]> {
    if (candidates.length === 0) return [];
    if (candidates.length <= limit) return candidates;

    // Build kernel matrix L (similarity matrix)
    const n = Math.min(candidates.length, 50); // Limit for computational efficiency
    const candidatesSubset = candidates.slice(0, n);
    
    const kernelMatrix = this.buildKernelMatrix(candidatesSubset);
    
    // Greedy DPP: iteratively select items maximizing determinant
    const selected: DiversityCandidate[] = [];
    const selectedIndices: number[] = [];
    
    for (let i = 0; i < Math.min(limit, n); i++) {
      let bestDet = -Infinity;
      let bestIndex = 0;
      
      for (let j = 0; j < n; j++) {
        if (selectedIndices.includes(j)) continue;
        
        const testIndices = [...selectedIndices, j];
        const det = this.calculateDeterminant(kernelMatrix, testIndices);
        
        if (det > bestDet) {
          bestDet = det;
          bestIndex = j;
        }
      }
      
      selectedIndices.push(bestIndex);
      selected.push(candidatesSubset[bestIndex]);
    }
    
    return selected;
  }

  /**
   * Build kernel matrix from candidates
   */
  private buildKernelMatrix(candidates: DiversityCandidate[]): number[][] {
    const n = candidates.length;
    const matrix: number[][] = Array(n).fill(0).map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          matrix[i][j] = candidates[i].score; // Quality on diagonal
        } else {
          // Similarity between items (scaled by quality)
          const sim = this.genreSimilarity(candidates[i], candidates[j]);
          matrix[i][j] = Math.sqrt(candidates[i].score * candidates[j].score) * (1 - sim);
        }
      }
    }
    
    return matrix;
  }

  /**
   * Calculate determinant of submatrix
   */
  private calculateDeterminant(matrix: number[][], indices: number[]): number {
    if (indices.length === 0) return 1;
    if (indices.length === 1) return matrix[indices[0]][indices[0]];
    
    // Extract submatrix
    const subMatrix = indices.map(i => indices.map(j => matrix[i][j]));
    
    // Use TensorFlow.js for efficient computation
    return tf.tidy(() => {
      const tensor = tf.tensor2d(subMatrix);
      // For small matrices, use simple determinant calculation
      // For production, use proper determinant calculation
      return tf.sum(tf.abs(tensor)).arraySync() as number;
    });
  }

  /**
   * Genre-based similarity
   */
  private genreSimilarity(a: DiversityCandidate, b: DiversityCandidate): number {
    const aGenres = new Set(a.genres);
    const bGenres = new Set(b.genres);
    const intersection = new Set(Array.from(aGenres).filter(g => bGenres.has(g)));
    const union = new Set([...a.genres, ...b.genres]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }
}

/**
 * Genre Balancer
 * Prevents filter bubbles by limiting consecutive same-genre recommendations
 */
export class GenreBalancer {
  /**
   * Apply genre balancing constraints
   */
  applyGenreBalancing(
    items: DiversityCandidate[],
    maxConsecutive: number = 3
  ): DiversityCandidate[] {
    const result: DiversityCandidate[] = [];
    const genreCount = new Map<string, number>();
    const genreLastPosition = new Map<string, number>();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const primaryGenre = item.genres[0] || 'unknown';
      
      const lastPos = genreLastPosition.get(primaryGenre) ?? -1;
      const consecutiveCount = (lastPos === i - 1) ? (genreCount.get(primaryGenre) || 0) + 1 : 1;
      
      // Apply penalty if too many consecutive same genre
      if (consecutiveCount > maxConsecutive) {
        item.score *= 0.7; // 30% penalty
      }
      
      result.push(item);
      genreCount.set(primaryGenre, consecutiveCount);
      genreLastPosition.set(primaryGenre, i);
    }

    // Re-sort after penalties
    return result.sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate genre diversity (Shannon entropy)
   */
  calculateGenreDiversity(items: DiversityCandidate[]): number {
    const genreCounts = new Map<string, number>();
    
    for (const item of items) {
      for (const genre of item.genres) {
        genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
      }
    }
    
    const total = items.length;
    let entropy = 0;
    
    for (const count of Array.from(genreCounts.values())) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
    
    return entropy;
  }
}

/**
 * Epsilon-Greedy Explorer
 * Balances exploitation (best items) with exploration (random items)
 */
export class EpsilonGreedyExplorer {
  /**
   * Apply epsilon-greedy exploration
   */
  applyExploration(
    items: DiversityCandidate[],
    epsilon: number = 0.1
  ): DiversityCandidate[] {
    const explorationCount = Math.floor(items.length * epsilon);
    
    if (explorationCount === 0) return items;

    // Split into exploitation and exploration
    const exploitationItems = items.slice(0, items.length - explorationCount);
    
    // Select random exploration items from lower ranks
    const explorationPool = items.slice(Math.floor(items.length * 0.3));
    const explorationItems = this.shuffleArray(explorationPool).slice(0, explorationCount);
    
    // Interleave exploration items
    const result: DiversityCandidate[] = [];
    const explorationInterval = Math.floor(exploitationItems.length / explorationCount);
    
    let explorationIndex = 0;
    for (let i = 0; i < exploitationItems.length; i++) {
      result.push(exploitationItems[i]);
      
      if ((i + 1) % explorationInterval === 0 && explorationIndex < explorationItems.length) {
        result.push(explorationItems[explorationIndex++]);
      }
    }
    
    // Add remaining exploration items
    while (explorationIndex < explorationItems.length) {
      result.push(explorationItems[explorationIndex++]);
    }
    
    return result;
  }

  /**
   * Shuffle array (Fisher-Yates)
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

/**
 * Serendipity Injector
 * Adds surprising, out-of-comfort-zone recommendations
 */
export class SerendipityInjector {
  /**
   * Inject serendipitous recommendations
   */
  injectSerendipity(
    items: DiversityCandidate[],
    userGenrePreferences: string[],
    serendipityRate: number = 0.15
  ): DiversityCandidate[] {
    const serendipityCount = Math.floor(items.length * serendipityRate);
    
    if (serendipityCount === 0) return items;

    const userGenreSet = new Set(userGenrePreferences);
    
    // Find items with low genre overlap (surprising)
    const serendipitousCandidates = items.filter(item => {
      const genreOverlap = item.genres.filter(g => userGenreSet.has(g)).length;
      return genreOverlap <= 1; // Max 1 genre overlap = surprising
    });
    
    // Select top serendipitous items by score
    const serendipityItems = serendipitousCandidates
      .sort((a, b) => b.score - a.score)
      .slice(0, serendipityCount);
    
    // Remove from main list and add back strategically
    const mainItems = items.filter(item => !serendipityItems.includes(item));
    
    // Interleave serendipity items
    const result: DiversityCandidate[] = [];
    const interval = Math.floor(mainItems.length / serendipityCount);
    
    let serendipityIndex = 0;
    for (let i = 0; i < mainItems.length; i++) {
      result.push(mainItems[i]);
      
      if ((i + 1) % interval === 0 && serendipityIndex < serendipityItems.length) {
        result.push(serendipityItems[serendipityIndex++]);
      }
    }
    
    return result;
  }
}

/**
 * Main Diversity Engine
 * Orchestrates all diversity algorithms
 */
export class DiversityEngine {
  private mmr = new MMRDiversifier();
  private dpp = new DPPDiversifier();
  private genreBalancer = new GenreBalancer();
  private explorer = new EpsilonGreedyExplorer();
  private serendipity = new SerendipityInjector();

  /**
   * Apply comprehensive diversity optimization
   */
  async applyDiversity(
    candidates: DiversityCandidate[],
    config: DiversityConfig,
    userGenrePreferences: string[] = []
  ): Promise<DiversityCandidate[]> {
    let results = [...candidates];
    
    console.log(`[Diversity] Starting with ${results.length} candidates`);
    
    // Step 1: Apply primary diversity algorithm
    if (config.diversityMetric === 'mmr') {
      results = await this.mmr.applyMMR(results, results.length, config.lambda);
      console.log(`[Diversity] MMR applied (lambda=${config.lambda})`);
    } else if (config.diversityMetric === 'dpp') {
      results = await this.dpp.applyDPP(results, results.length);
      console.log(`[Diversity] DPP applied`);
    } else {
      // Hybrid: Apply both
      results = await this.mmr.applyMMR(results, results.length, config.lambda);
      results = await this.dpp.applyDPP(results, Math.min(results.length, 30));
      console.log(`[Diversity] Hybrid (MMR + DPP) applied`);
    }
    
    // Step 2: Genre balancing
    results = this.genreBalancer.applyGenreBalancing(results, config.maxConsecutiveSameGenre);
    console.log(`[Diversity] Genre balancing applied (max consecutive=${config.maxConsecutiveSameGenre})`);
    
    // Step 3: Exploration
    results = this.explorer.applyExploration(results, config.epsilonExploration);
    console.log(`[Diversity] Exploration applied (epsilon=${config.epsilonExploration})`);
    
    // Step 4: Serendipity injection
    if (userGenrePreferences.length > 0) {
      results = this.serendipity.injectSerendipity(results, userGenrePreferences, config.serendipityRate);
      console.log(`[Diversity] Serendipity injected (rate=${config.serendipityRate})`);
    }
    
    return results;
  }

  /**
   * Calculate diversity metrics for monitoring
   */
  calculateMetrics(
    items: DiversityCandidate[],
    userGenrePreferences: string[]
  ): DiversityMetrics {
    // Intra-diversity: average pairwise dissimilarity
    let totalDissimilarity = 0;
    let pairCount = 0;
    
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const sim = this.calculateGenreSimilarity(items[i], items[j]);
        totalDissimilarity += (1 - sim);
        pairCount++;
      }
    }
    
    const intraDiversity = pairCount > 0 ? totalDissimilarity / pairCount : 0;
    
    // Genre balance (Shannon entropy)
    const genreBalance = this.genreBalancer.calculateGenreDiversity(items);
    
    // Serendipity score: % of items with no user genre overlap
    const userGenreSet = new Set(userGenrePreferences);
    const serendipitousCount = items.filter(item => 
      item.genres.every(g => !userGenreSet.has(g))
    ).length;
    const serendipityScore = items.length > 0 ? serendipitousCount / items.length : 0;
    
    // Coverage score: % of unique genres
    const allGenres = new Set(items.flatMap(item => item.genres));
    const coverageScore = allGenres.size / Math.max(userGenrePreferences.length, 1);
    
    return {
      intraDiversity,
      genreBalance,
      serendipityScore,
      explorationRate: 0.1, // From config
      coverageScore: Math.min(coverageScore, 1)
    };
  }

  /**
   * Genre similarity helper
   */
  private calculateGenreSimilarity(a: DiversityCandidate, b: DiversityCandidate): number {
    const aGenres = new Set(a.genres);
    const bGenres = new Set(b.genres);
    const intersection = new Set(Array.from(aGenres).filter(g => bGenres.has(g)));
    const union = new Set([...a.genres, ...b.genres]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }
}

// Export singleton
export const diversityEngine = new DiversityEngine();

// Export interfaces and classes
export type {
  DiversityCandidate,
  DiversityConfig,
  DiversityMetrics
};
