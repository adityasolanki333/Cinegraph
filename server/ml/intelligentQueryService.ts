/**
 * Intelligent Query Service
 * 
 * Unified NLP service that consolidates query validation, intent analysis, 
 * entity extraction, and semantic search into a single pipeline.
 * 
 * Architecture:
 * - QueryValidator: Validates queries, corrects typos, detects vagueness
 * - IntentAndEntityAnalyzer: Classifies intent, extracts entities
 * - SemanticSearchEngine: Performs semantic search with USE + TF.js fallback
 * 
 * Features:
 * - Query validation and refinement
 * - Intent classification (franchise, attribute, semantic, contextual, hybrid)
 * - Entity extraction (actors, directors, years, genres)
 * - Mood, theme, and atmosphere detection
 * - Negation handling
 * - Semantic search with Universal Sentence Encoder
 * - Enhanced prompt generation for AI
 */

import { tmdbService } from '../tmdb';
import { useService } from './universalSentenceEncoder';
import * as tf from '@tensorflow/tfjs-node';

// ============================================================================
// INTERFACES
// ============================================================================

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  issues: string[];
  suggestions: string[];
  refinedQuery?: string;
}

export interface QueryIntent {
  type: 'attribute' | 'content_similarity' | 'semantic' | 'contextual' | 'hybrid' | 'franchise';
  confidence: number;
  attributes?: {
    genres?: string[];
    actors?: string[];
    directors?: string[];
    year?: number;
    decade?: string;
    rating?: { min?: number; max?: number };
    runtime?: { min?: number; max?: number };
  };
  similarity?: {
    referenceTitles?: string[];
    creators?: string[];
  };
  semantic?: {
    mood?: string;
    themes?: string[];
    plotElements?: string[];
    atmosphere?: string;
    emotions?: string[];
  };
  contextual?: {
    occasion?: string;
    audience?: string;
    platform?: string;
    language?: string;
  };
  franchise?: {
    franchiseName: string;
    queryType: 'all_movies' | 'latest' | 'chronological';
  };
  negations?: {
    excludeGenres?: string[];
    excludeMoods?: string[];
    excludeThemes?: string[];
    excludeActors?: string[];
  };
}

export interface ParsedQuery {
  intent: QueryIntent;
  enhancedPrompt: string;
  searchStrategies: string[];
  originalQuery: string;
  keywords: string[];
}

export interface UserContext {
  userId?: string;
  recentWatched?: Array<{ tmdbId: number; title: string; mediaType: string }>;
  watchlist?: Array<{ tmdbId: number; title: string; mediaType: string }>;
  favoriteGenres?: string[];
  favoriteActors?: string[];
  preferences?: {
    mediaType?: string[];
    excludeGenres?: string[];
  };
}

export interface SemanticSearchResult {
  tmdbId: number;
  similarity: number;
  method?: 'use' | 'legacy';
}

export interface ProcessedQuery {
  validation: ValidationResult;
  parsed: ParsedQuery;
  semanticResults?: SemanticSearchResult[];
  success: boolean;
}

// ============================================================================
// MODULE 1: QUERY VALIDATOR
// ============================================================================

class QueryValidator {
  private readonly MIN_QUERY_LENGTH = 3;
  private readonly MAX_QUERY_LENGTH = 500;

  private readonly typoMap: Record<string, string> = {
    'moveis': 'movies',
    'movei': 'movie',
    'flim': 'film',
    'filim': 'film',
    'comdy': 'comedy',
    'thrilr': 'thriller',
    'horrow': 'horror',
    'scifi': 'sci-fi',
    'romanc': 'romance',
    'documentry': 'documentary',
    'recomend': 'recommend',
    'recomendation': 'recommendation',
    'sumthing': 'something',
    'somthing': 'something'
  };

  validate(query: string): ValidationResult {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let confidence = 1.0;
    let refinedQuery = query.trim();

    if (!query || query.trim().length === 0) {
      return {
        isValid: false,
        confidence: 0,
        issues: ['Query is empty'],
        suggestions: [
          'Try: "I want funny movies"',
          'Try: "Show me action films from the 90s"',
          'Try: "Movies like Inception"'
        ]
      };
    }

    if (query.trim().length < this.MIN_QUERY_LENGTH) {
      return {
        isValid: false,
        confidence: 0,
        issues: ['Query is too short to understand your request'],
        suggestions: [
          'Try: "I want action movies"',
          'Try: "Show me funny comedies"',
          'Try: "Movies like The Matrix"'
        ]
      };
    }

    if (this.isNonMovieQuery(query)) {
      return {
        isValid: false,
        confidence: 0,
        issues: ['This doesn\'t appear to be a movie/show request'],
        suggestions: [
          'Ask about movies: "funny movies for tonight"',
          'Ask about shows: "TV shows like Breaking Bad"',
          'Ask about actors: "movies with Tom Hanks"'
        ]
      };
    }

    if (query.length > this.MAX_QUERY_LENGTH) {
      issues.push('Query is too long');
      refinedQuery = query.substring(0, this.MAX_QUERY_LENGTH) + '...';
      confidence -= 0.2;
    }

    const correctedQuery = this.correctCommonTypos(query);
    if (correctedQuery !== query) {
      refinedQuery = correctedQuery;
      suggestions.push(`Did you mean: "${correctedQuery}"?`);
    }

    if (this.isTooVague(query)) {
      return {
        isValid: false,
        confidence: 0.2,
        issues: ['Your request is too vague to provide good recommendations'],
        suggestions: [
          'Try: "I want funny movies for tonight"',
          'Try: "Show me action films from the 90s"',
          'Try: "Movies starring Tom Hanks"',
          'Try: "Something like Inception"'
        ]
      };
    }

    if (this.containsOffensiveContent(query)) {
      return {
        isValid: false,
        confidence: 0,
        issues: ['Query contains inappropriate content'],
        suggestions: ['Please rephrase your request in a respectful manner']
      };
    }

    const enhancedQuery = this.enhanceQuery(refinedQuery);
    if (enhancedQuery !== refinedQuery) {
      refinedQuery = enhancedQuery;
    }

    const isValid = confidence > 0.3 && issues.length < 3;

    return {
      isValid,
      confidence: Math.max(0, Math.min(1, confidence)),
      issues,
      suggestions: suggestions.slice(0, 3),
      refinedQuery: isValid ? refinedQuery : undefined
    };
  }

  private correctCommonTypos(query: string): string {
    let corrected = query;
    for (const [typo, correction] of Object.entries(this.typoMap)) {
      const regex = new RegExp(`\\b${typo}\\b`, 'gi');
      corrected = corrected.replace(regex, correction);
    }
    return corrected;
  }

  private isNonMovieQuery(query: string): boolean {
    const trimmed = query.trim().toLowerCase();
    const greetings = [
      'hi', 'hello', 'hey', 'howdy', 'greetings', 'sup', 'yo',
      'good morning', 'good afternoon', 'good evening',
      'how are you', 'whats up', 'what\'s up', 'wassup'
    ];
    return greetings.includes(trimmed);
  }

  private isTooVague(query: string): boolean {
    const trimmed = query.trim();
    const words = trimmed.toLowerCase().split(/\s+/);
    
    if (words.length === 1) return true;

    if (this.hasSpecificDescriptors(trimmed)) return false;

    const vaguePatterns = [
      /^(anything|something)\s+(good|nice|fun|cool|interesting|entertaining)/i,
      /^(got|have|know)\s+(anything|something)/i,
      /^(any|got|have)\s+(recommendations?|suggestions?)/i,
      /^(what|what's|whats)\s+(good|new|popular)/i,
      /^(something|anything)\s+to\s+(watch|see)/i,
      /^(recommend|suggest)\s+(something|anything)/i,
      /^(give\s+me|show\s+me)\s+(something|anything)/i,
      /^(can\s+you|could\s+you)\s+(recommend|suggest)/i,
      /^(do\s+you\s+have|you\s+got)\s+(any|some)/i,
      /^(any|some|got)\s+(ideas?|thoughts?)/i,
      /^(i\s+want|i'd\s+like|id\s+like)\s+(something|anything)/i,
      /^(hey|hi|hello|yo),?\s+(anything|something|got|have|do\s+you)/i,
      /^(please|pls)\s+(recommend|suggest)/i,
      /^(good|best|great|nice|any|some|a)\s+(movie|film|show)s?\s*$/i,
      /^(watch|see|find)\s+(movie|film|show)s?\s*$/i
    ];

    return vaguePatterns.some(pattern => pattern.test(trimmed));
  }

  private hasSpecificDescriptors(query: string): boolean {
    const lowerQuery = query.toLowerCase();
    
    const genres = ['action', 'comedy', 'drama', 'horror', 'thriller', 'romance', 'sci-fi', 'scifi', 'fantasy', 
                    'documentary', 'animation', 'mystery', 'crime', 'adventure', 'western', 'musical', 'war'];
    if (genres.some(g => lowerQuery.includes(g))) return true;

    if (/\b(starring|directed by|with|by)\s+[A-Z][a-z]+/.test(query)) return true;
    if (/\b(like|similar to)\s+[A-Z]/.test(query)) return true;
    if (/\b(19|20)\d{2}\b/.test(query) || /\b\d{2}s\b/.test(query)) return true;

    const themes = ['space', 'war', 'friendship', 'death', 'survival', 'revenge', 
                   'heist', 'detective', 'spy', 'superhero', 'zombie', 'vampire', 'alien', 'time travel'];
    if (themes.some(t => lowerQuery.includes(t))) return true;

    const moods = ['dark', 'scary', 'uplifting', 'emotional', 'intense', 'suspenseful', 
                  'heartwarming', 'inspiring', 'thought-provoking', 'mind-bending',
                  'funny', 'hilarious', 'laugh', 'exciting', 'thrilling', 'romantic', 'love',
                  'feel-good', 'cheerful', 'happy', 'sad', 'depressing', 'nostalgic', 'classic',
                  'hidden', 'underrated', 'popular', 'trending', 'new', 'old', 'recent', 'great',
                  'best', 'good', 'awesome', 'amazing', 'incredible', 'cool', 'interesting'];
    if (moods.some(m => lowerQuery.includes(m))) return true;

    return false;
  }

  private containsOffensiveContent(query: string): boolean {
    const offensivePatterns = [/\b(inappropriate|offensive|explicit)\b/i];
    return offensivePatterns.some(pattern => pattern.test(query));
  }

  private enhanceQuery(query: string): string {
    const lowerQuery = query.toLowerCase();
    let enhanced = query;

    const expansions: Record<string, string> = {
      ' scifi ': ' sci-fi science fiction ',
      ' rom com': ' romantic comedy',
      'romcom': 'romantic comedy',
      ' xmas ': ' christmas ',
      ' 90s ': ' 1990s ',
      ' 80s ': ' 1980s '
    };

    for (const [abbr, expansion] of Object.entries(expansions)) {
      if (lowerQuery.includes(abbr)) {
        enhanced = enhanced.replace(new RegExp(abbr, 'gi'), ` ${expansion} `);
      }
    }

    if (lowerQuery.includes('funny') && !lowerQuery.includes('comedy')) {
      enhanced = enhanced + ' comedy';
    }

    if (lowerQuery.includes('scary') && !lowerQuery.includes('horror')) {
      enhanced = enhanced + ' horror';
    }

    return enhanced.trim();
  }
}

// ============================================================================
// MODULE 2: INTENT AND ENTITY ANALYZER
// ============================================================================

class IntentAndEntityAnalyzer {
  private readonly actorPatterns = [
    /(?:starring|with|featuring|from|by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:movies?|films?|shows?)/gi,
    /(?:actor|actress)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi
  ];

  private readonly directorPatterns = [
    /(?:directed by|director|from director)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)'?s?\s+(?:films?|movies?)/gi
  ];

  private readonly moodMap = {
    happy: ['funny', 'comedy', 'cheerful', 'uplifting', 'feel-good', 'lighthearted', 'joyful', 'heartwarming'],
    sad: ['emotional', 'tearjerker', 'cry', 'dramatic', 'melancholic', 'heartbreaking', 'touching', 'poignant'],
    scary: ['horror', 'frightening', 'terrifying', 'suspenseful', 'creepy', 'spine-chilling', 'scary', 'haunting', 'eerie'],
    romantic: ['love', 'romance', 'romantic', 'date night', 'passionate', 'relationship', 'couples', 'tender'],
    energetic: ['action', 'exciting', 'thrilling', 'fast-paced', 'adrenaline', 'intense', 'explosive', 'dynamic'],
    thoughtful: ['deep', 'philosophical', 'intellectual', 'thought-provoking', 'meaningful', 'profound', 'contemplative'],
    dark: ['dark', 'gritty', 'noir', 'bleak', 'cynical', 'disturbing', 'twisted'],
    inspiring: ['inspiring', 'motivational', 'uplifting', 'empowering', 'triumphant', 'heroic']
  };

  private readonly themePatterns = {
    'coming-of-age': ['coming of age', 'growing up', 'teenage', 'adolescence', 'youth'],
    'revenge': ['revenge', 'vengeance', 'payback', 'retaliation'],
    'redemption': ['redemption', 'second chance', 'forgiveness', 'salvation'],
    'survival': ['survival', 'endurance', 'stranded', 'isolated'],
    'family': ['family', 'parents', 'children', 'siblings', 'generations'],
    'friendship': ['friendship', 'friends', 'buddy', 'companionship'],
    'identity': ['identity', 'self-discovery', 'who am i', 'finding myself'],
    'justice': ['justice', 'law', 'court', 'lawyer', 'trial'],
    'war': ['war', 'battle', 'military', 'combat', 'soldier'],
    'time-travel': ['time travel', 'time loop', 'past', 'future', 'temporal'],
    'artificial-intelligence': ['ai', 'artificial intelligence', 'robots', 'cyborg', 'android'],
    'conspiracy': ['conspiracy', 'cover-up', 'secret', 'hidden truth'],
    'heist': ['heist', 'robbery', 'theft', 'steal', 'con'],
    'murder-mystery': ['murder', 'detective', 'investigation', 'whodunit', 'crime']
  };

  private readonly atmospherePatterns = {
    atmospheric: ['atmospheric', 'moody', 'ambiance', 'mood'],
    visually_stunning: ['visually stunning', 'beautiful', 'cinematography', 'gorgeous', 'spectacular'],
    minimalist: ['minimalist', 'simple', 'quiet', 'slow burn', 'meditative'],
    epic: ['epic', 'grand', 'sweeping', 'massive', 'spectacular'],
    intimate: ['intimate', 'personal', 'character-driven', 'close', 'small scale'],
    surreal: ['surreal', 'dreamlike', 'bizarre', 'abstract', 'strange']
  };

  private readonly occasionPatterns = {
    'date-night': ['date night', 'romantic evening', 'couples', 'with partner'],
    'family': ['family', 'kids', 'children', 'family-friendly', 'all ages'],
    'party': ['party', 'group', 'friends', 'gathering'],
    'solo': ['alone', 'solo', 'by myself', 'personal'],
    'rainy-day': ['rainy day', 'cozy', 'comfort', 'lazy day'],
    'weekend': ['weekend', 'binge', 'marathon', 'series']
  };

  private readonly negationPatterns = {
    beforeTerm: /\b(not|no|never|without|avoid|exclude|don't|isn't|won't)\s+(?:\w+\s+){0,2}(scary|romantic|action|comedy|drama|horror|sad|happy|dark|funny|violent|boring)\b/gi,
    withoutPattern: /without\s+(romance|action|violence|blood|gore|scary|horror|comedy|drama|music)/gi,
    noPattern: /\bno\s+(action|romance|violence|comedy|drama|horror|scary|sad)/gi
  };

  async analyze(query: string, userContext?: UserContext): Promise<ParsedQuery> {
    const lowercaseQuery = query.toLowerCase();
    
    const useSemanticIntent = await this.extractSemanticIntentWithUSE(query);
    
    const intent: QueryIntent = {
      type: 'hybrid',
      confidence: 0,
      attributes: {},
      similarity: {},
      semantic: {},
      contextual: {},
      franchise: undefined
    };

    let intentType: QueryIntent['type'] = 'semantic';
    let maxConfidence = 0;

    const franchiseMatch = this.extractFranchiseQuery(query);
    if (franchiseMatch) {
      intent.franchise = franchiseMatch;
      intent.type = 'franchise';
      intent.confidence = 0.95;
      
      return {
        intent,
        enhancedPrompt: this.generateEnhancedPrompt(query, intent),
        searchStrategies: this.determineSearchStrategies(intent),
        originalQuery: query,
        keywords: this.extractKeywords(query)
      };
    }

    const actors = await this.extractAndValidateActors(query);
    const directors = await this.extractAndValidateDirectors(query);
    const year = this.extractYear(query);
    const decade = this.extractDecade(query);
    const genres = this.extractGenres(query);

    if (actors.length > 0 || directors.length > 0 || year || genres.length > 0) {
      intent.attributes = { actors, directors, year, decade, genres };
      intentType = 'attribute';
      maxConfidence = 0.9;
    }

    const similarityMatch = this.extractSimilarityQuery(query);
    if (similarityMatch.referenceTitles.length > 0 || similarityMatch.creators.length > 0) {
      intent.similarity = similarityMatch;
      intentType = 'content_similarity';
      maxConfidence = Math.max(maxConfidence, 0.85);
    }

    const patternMood = this.extractMood(query);
    const patternThemes = this.extractThemes(query);
    const plotElements = this.extractPlotElements(query);
    const patternAtmosphere = this.extractAtmosphere(query);
    const emotions = this.extractEmotions(query);
    
    const mood = (useSemanticIntent?.confidence && useSemanticIntent.confidence > 0.6) 
      ? (useSemanticIntent.mood || patternMood) 
      : (patternMood || useSemanticIntent?.mood);
      
    const themes = Array.from(new Set([
      ...patternThemes, 
      ...(useSemanticIntent?.themes || [])
    ]));
    
    const atmosphere = (useSemanticIntent?.confidence && useSemanticIntent.confidence > 0.6)
      ? (useSemanticIntent.atmosphere || patternAtmosphere)
      : (patternAtmosphere || useSemanticIntent?.atmosphere);

    if (mood || themes.length > 0 || plotElements.length > 0 || atmosphere) {
      intent.semantic = { mood, themes, plotElements, atmosphere, emotions };
      if (intentType !== 'attribute' && intentType !== 'content_similarity') {
        intentType = 'semantic';
        const useConfidenceBoost = useSemanticIntent?.confidence || 0;
        maxConfidence = Math.max(maxConfidence, 0.7 + (useConfidenceBoost * 0.2));
      }
    }

    const occasion = this.extractOccasion(query);
    const audience = this.extractAudience(query);
    const platform = this.extractPlatform(query);

    if (occasion || audience || platform) {
      intent.contextual = { occasion, audience, platform };
      intentType = 'contextual';
      maxConfidence = Math.max(maxConfidence, 0.8);
    }

    const negations = this.extractNegations(query);
    if (negations.excludeGenres.length > 0 || negations.excludeMoods.length > 0 || 
        negations.excludeThemes.length > 0 || negations.excludeActors.length > 0) {
      intent.negations = negations;
    }

    const intentCount = [
      intent.attributes && Object.keys(intent.attributes).length > 0,
      intent.similarity && Object.keys(intent.similarity).length > 0,
      intent.semantic && Object.keys(intent.semantic).length > 0,
      intent.contextual && Object.keys(intent.contextual).length > 0
    ].filter(Boolean).length;

    if (intentCount > 1) {
      intentType = 'hybrid';
      maxConfidence = Math.max(maxConfidence, 0.75);
    }

    intent.type = intentType;
    intent.confidence = maxConfidence || 0.5;

    return {
      intent,
      enhancedPrompt: this.generateEnhancedPrompt(query, intent),
      searchStrategies: this.determineSearchStrategies(intent),
      originalQuery: query,
      keywords: this.extractKeywords(query)
    };
  }

  private async extractSemanticIntentWithUSE(query: string): Promise<{
    mood?: string;
    themes: string[];
    atmosphere?: string;
    confidence: number;
  }> {
    try {
      const semanticTemplates = {
        moods: {
          'happy': 'funny lighthearted comedy cheerful uplifting feel-good',
          'sad': 'emotional tearjerker dramatic melancholic heartbreaking',
          'scary': 'horror frightening terrifying suspenseful creepy',
          'romantic': 'love romance passionate relationship tender',
          'energetic': 'action exciting thrilling fast-paced adrenaline',
          'thoughtful': 'philosophical intellectual thought-provoking meaningful',
          'dark': 'dark gritty noir bleak cynical disturbing'
        },
        themes: {
          'coming-of-age': 'coming of age growing up teenage youth discovery',
          'revenge': 'revenge vengeance payback retaliation justice',
          'redemption': 'redemption second chance forgiveness salvation',
          'survival': 'survival endurance stranded isolated struggle',
          'artificial-intelligence': 'AI artificial intelligence robots consciousness technology',
          'time-travel': 'time travel paradox future past temporal',
          'heist': 'heist robbery theft con elaborate plan steal',
          'murder-mystery': 'murder detective investigation whodunit solve crime'
        },
        atmospheres: {
          'atmospheric': 'atmospheric moody ambiance immersive mood-driven',
          'visually_stunning': 'visually stunning beautiful cinematography gorgeous spectacular',
          'minimalist': 'minimalist simple quiet slow burn meditative',
          'epic': 'epic grand sweeping massive spectacular scale',
          'surreal': 'surreal dreamlike bizarre abstract strange weird'
        }
      };

      const allTemplates: Array<{ category: string; key: string; text: string }> = [];
      
      for (const [category, templates] of Object.entries(semanticTemplates)) {
        for (const [key, text] of Object.entries(templates)) {
          allTemplates.push({ category, key, text });
        }
      }

      const result = await useService.findMostSimilar(
        query.toLowerCase(),
        allTemplates.map(t => t.text)
      );

      if (!result || result.similarity < 0.3) {
        return { themes: [], confidence: 0 };
      }

      const matchedTemplate = allTemplates[result.index];
      const extractedIntent: any = { themes: [], confidence: result.similarity };

      if (matchedTemplate.category === 'moods') {
        extractedIntent.mood = matchedTemplate.key;
      } else if (matchedTemplate.category === 'themes') {
        extractedIntent.themes = [matchedTemplate.key];
      } else if (matchedTemplate.category === 'atmospheres') {
        extractedIntent.atmosphere = matchedTemplate.key;
      }
      
      return extractedIntent;
    } catch (error) {
      return { themes: [], confidence: 0 };
    }
  }

  private async extractAndValidateActors(query: string): Promise<string[]> {
    const actors: string[] = [];
    
    for (const pattern of this.actorPatterns) {
      const matches = Array.from(query.matchAll(pattern));
      for (const match of matches) {
        if (match[1] && match[1].length > 2) {
          const actorName = match[1].trim();
          if (this.isValidPersonName(actorName)) {
            actors.push(actorName);
          }
        }
      }
    }

    const knownActors = [
      'Tom Hanks', 'Leonardo DiCaprio', 'Meryl Streep', 'Denzel Washington',
      'Keanu Reeves', 'Brad Pitt', 'Tom Cruise', 'Morgan Freeman',
      'Scarlett Johansson', 'Robert Downey Jr', 'Jennifer Lawrence'
    ];

    for (const actor of knownActors) {
      if (query.toLowerCase().includes(actor.toLowerCase())) {
        if (!actors.find(a => a.toLowerCase() === actor.toLowerCase())) {
          actors.push(actor);
        }
      }
    }

    return Array.from(new Set(actors));
  }

  private async extractAndValidateDirectors(query: string): Promise<string[]> {
    const directors: string[] = [];
    
    for (const pattern of this.directorPatterns) {
      const matches = Array.from(query.matchAll(pattern));
      for (const match of matches) {
        if (match[1] && match[1].length > 2) {
          const directorName = match[1].trim();
          if (this.isValidPersonName(directorName)) {
            directors.push(directorName);
          }
        }
      }
    }

    const knownDirectors = [
      'Christopher Nolan', 'Quentin Tarantino', 'Martin Scorsese', 'Steven Spielberg',
      'Denis Villeneuve', 'Wes Anderson', 'Greta Gerwig', 'David Fincher'
    ];

    for (const director of knownDirectors) {
      if (query.toLowerCase().includes(director.toLowerCase())) {
        if (!directors.find(d => d.toLowerCase() === director.toLowerCase())) {
          directors.push(director);
        }
      }
    }

    return Array.from(new Set(directors));
  }

  private isValidPersonName(name: string): boolean {
    const words = name.trim().split(/\s+/);
    if (words.length < 2) return false;
    return words.every(word => /^[A-Z]/.test(word));
  }

  private extractYear(query: string): number | undefined {
    const yearMatch = query.match(/\b(19|20)\d{2}\b/);
    return yearMatch ? parseInt(yearMatch[0]) : undefined;
  }

  private extractDecade(query: string): string | undefined {
    if (query.includes('90s') || query.includes('1990s')) return '1990s';
    if (query.includes('80s') || query.includes('1980s')) return '1980s';
    if (query.includes('70s') || query.includes('1970s')) return '1970s';
    if (query.includes('2000s')) return '2000s';
    if (query.includes('2010s')) return '2010s';
    return undefined;
  }

  private extractGenres(query: string): string[] {
    const genres: string[] = [];
    const genreKeywords = [
      'action', 'comedy', 'drama', 'horror', 'thriller', 'romance', 'sci-fi',
      'fantasy', 'animation', 'documentary', 'mystery', 'crime', 'adventure',
      'western', 'war', 'musical'
    ];

    const lowerQuery = query.toLowerCase();
    for (const genre of genreKeywords) {
      if (lowerQuery.includes(genre)) {
        genres.push(genre);
      }
    }

    return genres;
  }

  private extractSimilarityQuery(query: string): { referenceTitles: string[]; creators: string[] } {
    const referenceTitles: string[] = [];
    const creators: string[] = [];

    const patterns = [
      /(?:like|similar to|as good as)\s+["']?([^"',.]+?)["']?\s*(?:movie|film|show|series)?$/i,
      /(?:movies?|films?|shows?|series)\s+(?:like|similar to)\s+["']?([^"',.]+?)["']?$/i,
      /(?:more|other)\s+(?:movies?|films?|shows?)\s+(?:from|by)\s+(.+?)(?:\s+or|\s+and|$)/i
    ];

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        const extracted = match[1].trim();
        if (extracted.length > 2) {
          referenceTitles.push(extracted);
        }
      }
    }

    return { referenceTitles, creators };
  }

  private extractFranchiseQuery(query: string): { franchiseName: string; queryType: 'all_movies' | 'latest' | 'chronological' } | null {
    const lowerQuery = query.toLowerCase();
    
    const franchisePatterns = [
      /\b(?:all|every|each)\s+(?:the\s+)?(.+?)\s+(?:movies?|films?|shows?)\b/i,
      /\b(?:the\s+)?(.+?)\s+(?:all|every|each)\s+(?:movies?|films?|shows?)\b/i,
      /\ball\s+(?:movies?|films?|shows?|episodes?)\s+(?:of|from|in|about|for)\s+(?:the\s+)?(.+)/i,
      /\b(?:the\s+)?(.+?)\s+(?:franchise|collection|series|saga|universe)\b/i,
      /\b(?:every|each)\s+(?:the\s+)?(.+?)\s+(?:movie|film|show|episode)\b/i,
      /\b(?:the\s+)?(.+?)\s+(?:complete|entire|whole|full)\s+(?:collection|series|set|saga)\b/i,
      /\blist\s+(?:all|of)?\s*(?:the\s+)?(.+?)\s+(?:movies?|films?|shows?)\b/i,
      /\b([A-Z][a-zA-Z\s&]+?)\s+(?:movies?|films?|shows?|collection)\b/,
      /\b(?:the\s+)?(.+?)\s+(?:in\s+order|chronologically|by\s+release\s+date)\b/i,
      /\b(?:all|every|each)\s+(?:the\s+)?(.+?)(?:\s+sequels?|\s+prequels?|\s+parts?)?\s*$/i
    ];

    for (const pattern of franchisePatterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        let franchiseName = match[1].trim()
          .replace(/\b(a|an|all|every|each|movies?|films?|franchise|series|collection|complete|entire|shows?|saga|universe)\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        const genericKeywords = ['action', 'comedy', 'drama', 'horror', 'thriller', 'romance', 'sci-fi'];
        const isGeneric = genericKeywords.some(keyword => franchiseName.toLowerCase() === keyword);
        
        if (franchiseName.length >= 2 && !isGeneric) {
          let queryType: 'all_movies' | 'latest' | 'chronological' = 'all_movies';
          
          if (lowerQuery.includes('latest') || lowerQuery.includes('newest') || lowerQuery.includes('recent')) {
            queryType = 'latest';
          } else if (lowerQuery.includes('order') || lowerQuery.includes('chronological') || lowerQuery.includes('timeline')) {
            queryType = 'chronological';
          }
          
          return { franchiseName, queryType };
        }
      }
    }
    
    return null;
  }

  private extractMood(query: string): string | undefined {
    const lowerQuery = query.toLowerCase();
    for (const [mood, keywords] of Object.entries(this.moodMap)) {
      if (keywords.some(keyword => lowerQuery.includes(keyword))) {
        return mood;
      }
    }
    return undefined;
  }

  private extractThemes(query: string): string[] {
    const themes: string[] = [];
    const lowerQuery = query.toLowerCase();

    for (const [theme, keywords] of Object.entries(this.themePatterns)) {
      if (keywords.some(keyword => lowerQuery.includes(keyword))) {
        themes.push(theme);
      }
    }

    return themes;
  }

  private extractPlotElements(query: string): string[] {
    const plotElements: string[] = [];
    const lowerQuery = query.toLowerCase();

    const elements = [
      'twist ending', 'plot twist', 'unreliable narrator', 'flashbacks',
      'non-linear', 'multiple timelines', 'ensemble cast', 'anthology',
      'found footage', 'mockumentary', 'frame narrative'
    ];

    for (const element of elements) {
      if (lowerQuery.includes(element)) {
        plotElements.push(element);
      }
    }

    return plotElements;
  }

  private extractAtmosphere(query: string): string | undefined {
    const lowerQuery = query.toLowerCase();
    for (const [atmosphere, keywords] of Object.entries(this.atmospherePatterns)) {
      if (keywords.some(keyword => lowerQuery.includes(keyword))) {
        return atmosphere;
      }
    }
    return undefined;
  }

  private extractEmotions(query: string): string[] {
    const emotions: string[] = [];
    const emotionKeywords = [
      'laugh', 'cry', 'scared', 'excited', 'moved', 'surprised',
      'tense', 'relaxed', 'nostalgic', 'hopeful', 'anxious'
    ];

    const lowerQuery = query.toLowerCase();
    for (const emotion of emotionKeywords) {
      if (lowerQuery.includes(emotion)) {
        emotions.push(emotion);
      }
    }

    return emotions;
  }

  private extractNegations(query: string): {
    excludeGenres: string[];
    excludeMoods: string[];
    excludeThemes: string[];
    excludeActors: string[];
  } {
    const excludeGenres: string[] = [];
    const excludeMoods: string[] = [];
    const excludeThemes: string[] = [];
    const excludeActors: string[] = [];
    const lowerQuery = query.toLowerCase();

    const genreMapping: { [key: string]: string } = {
      'scary': 'horror',
      'romantic': 'romance', 
      'action': 'action',
      'funny': 'comedy',
      'comedy': 'comedy',
      'drama': 'drama',
      'horror': 'horror',
      'sad': 'drama',
      'dark': 'thriller',
      'violent': 'action'
    };

    const negationMatches = [
      ...Array.from(lowerQuery.matchAll(this.negationPatterns.beforeTerm)),
      ...Array.from(lowerQuery.matchAll(this.negationPatterns.withoutPattern)),
      ...Array.from(lowerQuery.matchAll(this.negationPatterns.noPattern))
    ];

    for (const match of negationMatches) {
      const negatedTerm = match[2] || match[1];
      if (negatedTerm) {
        const term = negatedTerm.toLowerCase().trim();
        
        if (genreMapping[term]) {
          excludeGenres.push(genreMapping[term]);
        }
        
        if (Object.keys(this.moodMap).includes(term) || 
            Object.values(this.moodMap).flat().includes(term)) {
          excludeMoods.push(term);
        }
      }
    }

    if (lowerQuery.match(/\bno\s+blood\b/i) || lowerQuery.match(/\bno\s+gore\b/i)) {
      excludeGenres.push('horror');
      excludeThemes.push('violence');
    }

    if (lowerQuery.match(/\bnot\s+for\s+kids\b/i) || lowerQuery.match(/\badult\s+only\b/i)) {
      excludeGenres.push('animation', 'family');
    }

    return {
      excludeGenres: Array.from(new Set(excludeGenres)),
      excludeMoods: Array.from(new Set(excludeMoods)),
      excludeThemes: Array.from(new Set(excludeThemes)),
      excludeActors
    };
  }

  private extractOccasion(query: string): string | undefined {
    const lowerQuery = query.toLowerCase();
    for (const [occasion, keywords] of Object.entries(this.occasionPatterns)) {
      if (keywords.some(keyword => lowerQuery.includes(keyword))) {
        return occasion;
      }
    }
    return undefined;
  }

  private extractAudience(query: string): string | undefined {
    if (query.toLowerCase().includes('kids') || query.toLowerCase().includes('children')) {
      return 'children';
    }
    if (query.toLowerCase().includes('family')) {
      return 'family';
    }
    if (query.toLowerCase().includes('adults') || query.toLowerCase().includes('mature')) {
      return 'adults';
    }
    return undefined;
  }

  private extractPlatform(query: string): string | undefined {
    const platforms = ['netflix', 'prime', 'disney', 'hulu', 'hbo', 'apple tv', 'paramount'];
    const lowerQuery = query.toLowerCase();
    
    for (const platform of platforms) {
      if (lowerQuery.includes(platform)) {
        return platform;
      }
    }
    return undefined;
  }

  private extractKeywords(query: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
      'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'can', 'about',
      'movie', 'film', 'show', 'tv', 'series', 'watch', 'like', 'want', 'need'
    ]);

    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 10);
  }

  private generateEnhancedPrompt(query: string, intent: QueryIntent): string {
    let prompt = `User Query: "${query}"\n\n`;
    prompt += `Query Analysis:\n`;

    if (intent.attributes && Object.keys(intent.attributes).length > 0) {
      prompt += `- Attributes: `;
      const attrs: string[] = [];
      if (intent.attributes.actors?.length) attrs.push(`Actors: ${intent.attributes.actors.join(', ')}`);
      if (intent.attributes.directors?.length) attrs.push(`Directors: ${intent.attributes.directors.join(', ')}`);
      if (intent.attributes.year) attrs.push(`Year: ${intent.attributes.year}`);
      if (intent.attributes.decade) attrs.push(`Decade: ${intent.attributes.decade}`);
      if (intent.attributes.genres?.length) attrs.push(`Genres: ${intent.attributes.genres.join(', ')}`);
      prompt += attrs.join('; ') + '\n';
    }

    if (intent.similarity && Object.keys(intent.similarity).length > 0) {
      prompt += `- Looking for content similar to: ${intent.similarity.referenceTitles?.join(', ')}\n`;
    }

    if (intent.semantic && Object.keys(intent.semantic).length > 0) {
      prompt += `- Semantic preferences: `;
      const sem: string[] = [];
      if (intent.semantic.mood) sem.push(`Mood: ${intent.semantic.mood}`);
      if (intent.semantic.themes?.length) sem.push(`Themes: ${intent.semantic.themes.join(', ')}`);
      if (intent.semantic.atmosphere) sem.push(`Atmosphere: ${intent.semantic.atmosphere}`);
      prompt += sem.join('; ') + '\n';
    }

    if (intent.contextual && Object.keys(intent.contextual).length > 0) {
      prompt += `- Context: `;
      const ctx: string[] = [];
      if (intent.contextual.occasion) ctx.push(`Occasion: ${intent.contextual.occasion}`);
      if (intent.contextual.audience) ctx.push(`Audience: ${intent.contextual.audience}`);
      if (intent.contextual.platform) ctx.push(`Platform: ${intent.contextual.platform}`);
      prompt += ctx.join('; ') + '\n';
    }

    if (intent.negations && (intent.negations.excludeGenres?.length || intent.negations.excludeMoods?.length || 
        intent.negations.excludeThemes?.length || intent.negations.excludeActors?.length)) {
      prompt += `- EXCLUSIONS (user wants to AVOID): `;
      const excl: string[] = [];
      if (intent.negations.excludeGenres?.length) excl.push(`NO ${intent.negations.excludeGenres.join(', ')}`);
      if (intent.negations.excludeMoods?.length) excl.push(`NOT ${intent.negations.excludeMoods.join(', ')}`);
      if (intent.negations.excludeThemes?.length) excl.push(`AVOID ${intent.negations.excludeThemes.join(', ')}`);
      if (intent.negations.excludeActors?.length) excl.push(`EXCLUDE ${intent.negations.excludeActors.join(', ')}`);
      prompt += excl.join('; ') + '\n';
    }

    prompt += `\nIntent Type: ${intent.type} (Confidence: ${(intent.confidence * 100).toFixed(0)}%)`;

    return prompt;
  }

  private determineSearchStrategies(intent: QueryIntent): string[] {
    const strategies: string[] = [];

    if (intent.attributes && Object.keys(intent.attributes).length > 0) {
      if (intent.attributes.actors?.length) strategies.push('actor_search');
      if (intent.attributes.directors?.length) strategies.push('director_search');
      if (intent.attributes.genres?.length) strategies.push('genre_filter');
      if (intent.attributes.year || intent.attributes.decade) strategies.push('year_filter');
    }

    if (intent.similarity && intent.similarity.referenceTitles?.length) {
      strategies.push('similarity_search');
      strategies.push('content_based_filtering');
    }

    if (intent.semantic && Object.keys(intent.semantic).length > 0) {
      strategies.push('semantic_search');
      if (intent.semantic.themes?.length) strategies.push('theme_matching');
    }

    if (intent.contextual && Object.keys(intent.contextual).length > 0) {
      if (intent.contextual.platform) strategies.push('platform_filter');
      strategies.push('contextual_ranking');
    }

    strategies.push('ai_recommendation');

    return Array.from(new Set(strategies));
  }
}

// ============================================================================
// MODULE 3: SEMANTIC SEARCH ENGINE
// ============================================================================

class SemanticSearchEngine {
  private movieCache: Map<number, { title: string; overview: string; genres: number[]; embedding?: number[] }> = new Map();
  private vocabularyMap: Map<string, number> = new Map();
  private vocabularySize = 5000;
  private initialized = false;

  async initialize() {
    console.log('[SemanticEngine] Initializing semantic search engine...');
    
    try {
      await this.buildVocabulary();
      await this.preloadPopularMovies();
      this.initialized = true;
      console.log('[SemanticEngine] Initialized successfully');
    } catch (error) {
      console.error('[SemanticEngine] Initialization error:', error);
      this.initialized = false;
    }
  }

  async search(query: string, limit: number = 20): Promise<SemanticSearchResult[]> {
    try {
      console.log('[SemanticEngine] Attempting USE semantic search...');
      
      const candidates = Array.from(this.movieCache.entries()).map(([tmdbId, movie]) => ({
        tmdbId,
        text: `${movie.title} ${movie.overview}`.toLowerCase()
      }));
      
      if (candidates.length > 0) {
        const useResults = await useService.semanticSearch(query, candidates, limit);
        
        if (useResults && useResults.length > 0) {
          console.log(`[SemanticEngine] USE search returned ${useResults.length} results`);
          return useResults.map(r => ({ 
            tmdbId: r.tmdbId, 
            similarity: r.similarity, 
            method: 'use' 
          }));
        }
      }
      
      console.log('[SemanticEngine] USE search returned no results, falling back to legacy...');
    } catch (error) {
      console.warn('[SemanticEngine] USE search failed, falling back to legacy:', error);
    }
    
    console.log('[SemanticEngine] Using legacy semantic search');
    const queryEmbedding = this.createTFEmbedding(query.toLowerCase());
    const similarities: SemanticSearchResult[] = [];

    for (const [tmdbId, movie] of Array.from(this.movieCache.entries())) {
      if (!movie.embedding) {
        movie.embedding = this.createTFEmbedding(`${movie.title} ${movie.overview}`.toLowerCase());
      }
      
      const similarity = this.cosineSimilarity(queryEmbedding, movie.embedding);
      
      if (similarity > 0.1) {
        similarities.push({ tmdbId, similarity, method: 'legacy' });
      }
    }

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  private async buildVocabulary() {
    const commonWords = [
      'action', 'comedy', 'drama', 'horror', 'romance', 'thriller', 'sci-fi', 'fantasy',
      'adventure', 'mystery', 'crime', 'war', 'western', 'animation', 'documentary',
      'love', 'death', 'family', 'friend', 'life', 'time', 'world', 'man', 'woman',
      'young', 'old', 'new', 'good', 'bad', 'great', 'best', 'first', 'last',
      'story', 'fight', 'kill', 'save', 'find', 'help', 'meet', 'love', 'hate'
    ];
    
    commonWords.forEach((word, idx) => {
      this.vocabularyMap.set(word, idx + 1);
    });
    
    console.log('[SemanticEngine] Vocabulary built with', this.vocabularyMap.size, 'terms');
  }

  private createTFEmbedding(text: string): number[] {
    const words = this.extractKeywords(text);
    const embedding = new Array(100).fill(0);
    
    words.forEach((word, idx) => {
      const vocabIdx = this.vocabularyMap.get(word) || 0;
      if (vocabIdx > 0 && idx < 100) {
        embedding[idx] = vocabIdx / this.vocabularySize;
      }
    });
    
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      return embedding.map(val => val / magnitude);
    }
    
    return embedding;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
  }

  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
      'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'can', 'about',
      'movie', 'film', 'show', 'tv', 'series', 'watch', 'like', 'want', 'need'
    ]);
    
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  private async preloadPopularMovies() {
    try {
      const popular = await tmdbService.getPopularMovies();
      
      for (const movie of (popular.results || []).slice(0, 100)) {
        this.movieCache.set(movie.id, {
          title: movie.title || movie.name || '',
          overview: movie.overview || '',
          genres: movie.genre_ids || []
        });
      }
      
      console.log(`[SemanticEngine] Cached ${this.movieCache.size} movies for semantic search`);
    } catch (error) {
      console.error('[SemanticEngine] Error preloading movies:', error);
    }
  }
}

// ============================================================================
// MAIN SERVICE: INTELLIGENT QUERY SERVICE
// ============================================================================

export class IntelligentQueryService {
  private validator: QueryValidator;
  private analyzer: IntentAndEntityAnalyzer;
  private semanticEngine: SemanticSearchEngine;
  private initialized = false;

  constructor() {
    this.validator = new QueryValidator();
    this.analyzer = new IntentAndEntityAnalyzer();
    this.semanticEngine = new SemanticSearchEngine();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[IntelligentQueryService] Initializing unified NLP service...');
    
    try {
      await this.semanticEngine.initialize();
      this.initialized = true;
      console.log('[IntelligentQueryService] Service initialized successfully');
    } catch (error) {
      console.error('[IntelligentQueryService] Initialization error:', error);
      this.initialized = false;
    }
  }

  async processQuery(query: string, context?: UserContext): Promise<ProcessedQuery> {
    if (!this.initialized) {
      await this.initialize();
    }

    console.log('[IntelligentQueryService] Processing query:', query);

    // Step 1: Validate query
    const validation = this.validator.validate(query);
    
    if (!validation.isValid) {
      console.log('[IntelligentQueryService] Query validation failed:', validation.issues);
      return {
        validation,
        parsed: {
          intent: { type: 'semantic', confidence: 0 },
          enhancedPrompt: '',
          searchStrategies: [],
          originalQuery: query,
          keywords: []
        },
        success: false
      };
    }

    console.log('[IntelligentQueryService] Query validated successfully');

    // Step 2: Analyze intent and extract entities
    const parsed = await this.analyzer.analyze(validation.refinedQuery || query, context);
    
    console.log('[IntelligentQueryService] Intent analysis complete:', {
      type: parsed.intent.type,
      confidence: parsed.intent.confidence,
      strategies: parsed.searchStrategies
    });

    // Step 3: Perform semantic search if semantic/hybrid intent
    let semanticResults: SemanticSearchResult[] | undefined = undefined;
    
    if (parsed.intent.type === 'semantic' || parsed.intent.type === 'hybrid') {
      try {
        semanticResults = await this.semanticEngine.search(validation.refinedQuery || query, 20);
        console.log(`[IntelligentQueryService] Semantic search returned ${semanticResults.length} results`);
      } catch (error) {
        console.error('[IntelligentQueryService] Semantic search error:', error);
      }
    }

    // Step 4: Return consolidated response
    return {
      validation,
      parsed,
      semanticResults,
      success: true
    };
  }

  getStatus(): {
    initialized: boolean;
    modules: {
      validator: boolean;
      analyzer: boolean;
      semanticEngine: boolean;
    };
  } {
    return {
      initialized: this.initialized,
      modules: {
        validator: true,
        analyzer: true,
        semanticEngine: this.initialized
      }
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const intelligentQueryService = new IntelligentQueryService();
