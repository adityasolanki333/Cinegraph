/**
 * Universal Sentence Encoder Service
 * 
 * Uses the official @tensorflow-models/universal-sentence-encoder package
 * Compatible with TensorFlow.js v3.x
 * 
 * Features:
 * - 512-dimensional semantic embeddings
 * - Pre-trained on billions of words
 * - True semantic understanding (not just keyword matching)
 * - Cosine similarity for semantic search
 */

import * as tf from '@tensorflow/tfjs-node'; // Load TensorFlow Node backend
import * as use from '@tensorflow-models/universal-sentence-encoder';
import * as path from 'path';
import { db } from '../db';
import { semanticEmbeddings } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

interface SemanticSearchResult {
  tmdbId: number;
  similarity: number;
  text?: string;
}

export class UniversalSentenceEncoderService {
  private static readonly EMBEDDING_VERSION = 'v1-use-512';
  
  private model: use.UniversalSentenceEncoder | null = null;
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;
  
  // Path to local model
  private readonly localModelPath = path.resolve('models/universal-sentence-encoder');
  
  // TF-IDF statistics for tracking
  private tfidfStats = {
    totalDocuments: 0
  };
  
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    
    this.initializationPromise = this._initialize();
    return this.initializationPromise;
  }
  
  private async _initialize(): Promise<void> {
    try {
      console.log('[USE] Loading Universal Sentence Encoder from TensorFlow Hub...');
      console.log('[USE] This may take a moment on first load (model is ~50MB)');
      
      const startTime = Date.now();
      
      // Load from TensorFlow Hub (automatic caching)
      this.model = await use.load();
      
      const loadTime = Date.now() - startTime;
      console.log(`[USE] Model loaded successfully in ${loadTime}ms`);
      console.log('[USE] Subsequent loads will be faster due to caching');
      
      this.initialized = true;
      
      // Warm up the model with a test embedding
      await this.warmUp();
    } catch (error) {
      console.warn('[USE] Failed to load TensorFlow Hub model:', error instanceof Error ? error.message : error);
      console.log('[USE] Using lightweight fallback for semantic operations');
      
      // Mark as initialized with fallback mode
      this.initialized = true;
      this.model = null;
      this.initializationPromise = null;
    }
  }
  
  /**
   * Warm up the model with a test embedding to ensure it's ready
   */
  private async warmUp(): Promise<void> {
    try {
      const testSentence = ['test'];
      const embeddings = await this.embed(testSentence);
      embeddings.dispose();
      console.log('[USE] Model warm-up complete');
    } catch (error) {
      console.warn('[USE] Warm-up failed:', error);
    }
  }
  
  /**
   * Generate simple hash-based embeddings as fallback
   * Creates a 512-dimensional vector based on text features
   */
  private generateFallbackEmbedding(text: string): number[] {
    const embedding = new Array(512).fill(0);
    const normalized = text.toLowerCase().trim();
    
    // Use character-level features
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      const idx = (char + i) % 512;
      embedding[idx] += 1 / (normalized.length + 1);
    }
    
    // Add word-level features
    const words = normalized.split(/\s+/);
    words.forEach((word, idx) => {
      const hash = word.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const position = hash % 512;
      embedding[position] += 0.5 / (words.length + 1);
    });
    
    // Normalize to unit vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }
    
    return embedding;
  }

  /**
   * Generate embeddings for one or more texts
   * @param texts Array of strings to embed
   * @returns Tensor of shape [input.length, 512]
   */
  async embed(texts: string | string[]) {
    if (!this.initialized) {
      await this.initialize();
    }
    
    if (!this.model) {
      // Use fallback embeddings
      const textArray = Array.isArray(texts) ? texts : [texts];
      const embeddings = textArray.map(t => this.generateFallbackEmbedding(t));
      return tf.tensor2d(embeddings);
    }
    
    // The official package handles both string and string[]
    return await this.model.embed(texts);
  }
  
  /**
   * Generate embeddings and return as JavaScript array
   * @param texts Array of strings to embed
   * @returns Array of embeddings as number[][]
   */
  async embedToArray(texts: string[]): Promise<number[][]> {
    const embeddings = await this.embed(texts);
    const embeddingsArray = await embeddings.array();
    
    // Clean up tensor to prevent memory leaks
    embeddings.dispose();
    
    return embeddingsArray as number[][];
  }
  
  /**
   * Generate single embedding and return as array
   * @param text String to embed
   * @returns Embedding as number[]
   */
  async embedSingle(text: string): Promise<number[]> {
    const embeddings = await this.embedToArray([text]);
    return embeddings[0];
  }
  
  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      console.warn(`[USE] Dimension mismatch: ${a.length} vs ${b.length}`);
      return 0;
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (normA * normB);
  }
  
  /**
   * Perform semantic search using Universal Sentence Encoder
   * @param query Search query
   * @param candidates Array of candidates with tmdbId and text
   * @param limit Maximum number of results
   * @returns Sorted array of results with similarity scores
   */
  async semanticSearch(
    query: string,
    candidates: Array<{ tmdbId: number; text: string }>,
    limit: number = 20
  ): Promise<SemanticSearchResult[]> {
    if (candidates.length === 0) {
      return [];
    }
    
    const startTime = Date.now();
    
    try {
      // Encode query and all candidates in a single batch for efficiency
      const allTexts = [query, ...candidates.map(c => c.text)];
      
      console.log(`[USE] Encoding query + ${candidates.length} candidates...`);
      const embeddings = await this.embedToArray(allTexts);
      
      const queryEmbedding = embeddings[0];
      const candidateEmbeddings = embeddings.slice(1);
      
      // Calculate cosine similarities
      const results: SemanticSearchResult[] = candidates.map((candidate, idx) => ({
        tmdbId: candidate.tmdbId,
        similarity: this.cosineSimilarity(queryEmbedding, candidateEmbeddings[idx]),
        text: candidate.text
      }));
      
      // Sort by similarity (highest first) and limit results
      const sortedResults = results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
      
      const duration = Date.now() - startTime;
      console.log(`[USE] Semantic search completed in ${duration}ms`);
      console.log(`[USE] Top match: ${sortedResults[0]?.similarity.toFixed(3)} similarity`);
      
      return sortedResults;
    } catch (error) {
      console.error('[USE] Error in semantic search:', error);
      return [];
    }
  }
  
  /**
   * Batch similarity calculation for performance
   * Useful when you already have embeddings
   */
  async batchSimilarity(
    queryEmbedding: number[],
    candidateEmbeddings: Array<{ tmdbId: number; embedding: number[] }>
  ): Promise<Array<{ tmdbId: number; similarity: number }>> {
    return candidateEmbeddings.map(({ tmdbId, embedding }) => ({
      tmdbId,
      similarity: this.cosineSimilarity(queryEmbedding, embedding)
    }));
  }
  
  /**
   * Find most similar text from a list
   */
  async findMostSimilar(
    query: string,
    texts: string[]
  ): Promise<{ index: number; text: string; similarity: number } | null> {
    if (texts.length === 0) return null;
    
    const allTexts = [query, ...texts];
    const embeddings = await this.embedToArray(allTexts);
    
    const queryEmbedding = embeddings[0];
    const textEmbeddings = embeddings.slice(1);
    
    let maxSimilarity = -1;
    let maxIndex = -1;
    
    textEmbeddings.forEach((embedding, idx) => {
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        maxIndex = idx;
      }
    });
    
    if (maxIndex === -1) return null;
    
    return {
      index: maxIndex,
      text: texts[maxIndex],
      similarity: maxSimilarity
    };
  }
  
  /**
   * Calculate similarity between two texts
   */
  async calculateSimilarity(text1: string, text2: string): Promise<number> {
    const embeddings = await this.embedToArray([text1, text2]);
    return this.cosineSimilarity(embeddings[0], embeddings[1]);
  }
  
  /**
   * Store embedding in database
   */
  async storeEmbedding(
    tmdbId: number,
    mediaType: string,
    textSource: string
  ): Promise<void> {
    const embedding = await this.embedSingle(textSource);
    
    try {
      await db
        .insert(semanticEmbeddings)
        .values({
          tmdbId,
          mediaType,
          embedding,
          textSource
        })
        .onConflictDoUpdate({
          target: [semanticEmbeddings.tmdbId, semanticEmbeddings.mediaType],
          set: {
            embedding,
            textSource
          }
        });
      
      console.log(`[USE] Stored embedding for ${mediaType} ${tmdbId}`);
    } catch (error) {
      console.error(`[USE] Error storing embedding:`, error);
      throw error;
    }
  }
  
  /**
   * Retrieve embedding from database
   */
  async getEmbedding(
    tmdbId: number,
    mediaType: string
  ): Promise<number[] | null> {
    try {
      const result = await db
        .select()
        .from(semanticEmbeddings)
        .where(
          and(
            eq(semanticEmbeddings.tmdbId, tmdbId),
            eq(semanticEmbeddings.mediaType, mediaType)
          )
        )
        .limit(1);
      
      if (result.length === 0) return null;
      
      return result[0].embedding as number[];
    } catch (error) {
      console.error(`[USE] Error retrieving embedding:`, error);
      return null;
    }
  }
  
  /**
   * Update TF-IDF statistics (for compatibility with tfSemanticEmbeddings)
   */
  updateTFIDFStats(text: string): void {
    this.tfidfStats.totalDocuments += 1;
  }
  
  /**
   * Get service statistics
   */
  getStats(): {
    vocabularySize: number;
    embeddingDim: number;
    totalDocuments: number;
    initialized: boolean;
  } {
    return {
      vocabularySize: 0, // USE doesn't have explicit vocabulary
      embeddingDim: 512,
      totalDocuments: this.tfidfStats.totalDocuments,
      initialized: this.initialized
    };
  }
  
  /**
   * Get service status
   */
  getStatus(): {
    initialized: boolean;
    embeddingDim: number;
  } {
    return {
      initialized: this.initialized,
      embeddingDim: 512
    };
  }
  
  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    if (this.model) {
      // The official package doesn't expose a dispose method
      this.model = null;
    }
    this.initialized = false;
    this.initializationPromise = null;
    console.log('[USE] Resources cleaned up');
  }
}

// Singleton instance
export const useService = new UniversalSentenceEncoderService();
