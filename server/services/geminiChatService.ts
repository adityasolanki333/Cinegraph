import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import type { TMDBMovie, MovieChatResponse } from 'shared';

export class GeminiChatService {
  private genAI: GoogleGenerativeAI | null = null;
  private model: GenerativeModel | null = null;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    } else {
      console.warn('GEMINI_API_KEY is not configured. GeminiChatService will use fallback responses.');
    }
  }

  async getMovieRecommendations(userMessage: string, mediaTypes: string[] = ['movies']): Promise<MovieChatResponse> {
    try {
      if (!this.model) {
        return this.getFallbackResponse(userMessage);
      }

      console.log('[Gemini Chat] Processing query:', userMessage);
      
      const includesMovies = mediaTypes.includes('movies') || mediaTypes.includes('both');
      const includesTV = mediaTypes.includes('tv') || mediaTypes.includes('both');
      
      let mediaTypeText = 'movies';
      if (includesMovies && includesTV) {
        mediaTypeText = 'movies and TV shows';
      } else if (includesTV) {
        mediaTypeText = 'TV shows';
      }

      const prompt = this.createPrompt(userMessage, mediaTypeText);
      
      console.log('[Gemini Chat] Calling Gemini API...');
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const aiText = response.text();
      
      if (!aiText) {
        throw new Error('Empty response from Gemini API');
      }
      
      console.log('[Gemini Chat] Received response from Gemini');
      
      const movieTitles = this.extractMovieTitles(aiText);
      console.log('[Gemini Chat] Extracted titles:', movieTitles);
      
      const tmdbResults = await this.getMediaFromTMDB(movieTitles, mediaTypes);
      console.log('[Gemini Chat] Found', tmdbResults.length, 'movies from TMDB');
      
      const suggestions = this.extractSuggestions(aiText, movieTitles);
      
      return {
        response: aiText,
        movies: tmdbResults,
        suggestions,
        source: 'gemini-chat'
      };
    } catch (error) {
      console.error('[Gemini Chat] Error:', error);
      return this.getFallbackResponse(userMessage);
    }
  }

  private createPrompt(userMessage: string, mediaType: string): string {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.toLocaleString('en-US', { month: 'long' });
    
    const lowerMessage = userMessage.toLowerCase();
    const isUpcoming = lowerMessage.includes('upcoming') || lowerMessage.includes('coming soon');
    const isLatest = lowerMessage.includes('latest') || lowerMessage.includes('new') || lowerMessage.includes('recent');
    
    let timeGuidance = '';
    if (isUpcoming) {
      timeGuidance = `\n\nIMPORTANT: Focus on ${mediaType} that are scheduled for release in ${currentYear} or later. Include unreleased titles.`;
    } else if (isLatest) {
      timeGuidance = `\n\nIMPORTANT: Focus on ${mediaType} released in ${currentYear - 1} or ${currentYear}.`;
    }

    return `You are an expert movie and TV show recommendation assistant with deep knowledge of cinema, television, and viewer preferences.

Current date: ${currentMonth} ${currentYear}

User request: "${userMessage}"
${timeGuidance}

Your task: Recommend 10-15 highly relevant ${mediaType} that match the user's request perfectly.

Guidelines:
1. RELEVANCE: Each recommendation must directly match what the user is looking for
2. DIVERSITY: Mix popular titles with hidden gems, classics with recent releases
3. QUALITY: Prioritize well-reviewed and audience-favorite ${mediaType}
4. SPECIFICITY: If the user mentions specific genres, moods, actors, or themes, focus exclusively on those

Response format:
Start with a friendly introduction (1-2 sentences), then list your recommendations using this EXACT format:

🎬 **Movie Title (Year)** - Brief explanation of why this matches their request

Example:
"Great question! Here are some fantastic recommendations for you:

🎬 **The Shawshank Redemption (1994)** - A powerful story of hope and friendship that resonates with your interest in emotional depth
🎬 **Inception (2010)** - Mind-bending thriller perfect for fans of complex narratives
[Continue with more recommendations...]

Each of these ${mediaType} has been carefully selected to match what you're looking for! ✨"

Critical requirements:
✓ Use the EXACT format: "🎬 **Title (Year)**" for each recommendation
✓ Include the year in parentheses after each title
✓ Provide specific reasons for each recommendation
✓ Be enthusiastic but genuine
✓ Use emojis (🎬, 📺, 🍿, ✨) to make it engaging

Now provide your recommendations:`;
  }

  private extractMovieTitles(response: string): string[] {
    const titles: string[] = [];
    
    const patterns = [
      /[🎬📺]\s*\*\*([^*]+?)\s*\((\d{4}(?:-\d{4})?)\)\*\*/g,
      /[-•]\s*\*\*([^*]+?)\s*\((\d{4}(?:-\d{4})?)\)\*\*/g,
      /\d+\.\s*\*\*([^*]+?)\s*\((\d{4}(?:-\d{4})?)\)\*\*/g,
    ];
    
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(response)) !== null) {
        const title = match[1].trim();
        if (title.length > 1 && !titles.includes(title)) {
          titles.push(title);
        }
      }
    });
    
    if (titles.length === 0) {
      const fallbackPattern = /\*\*([^*]+?)\*\*/g;
      let match;
      while ((match = fallbackPattern.exec(response)) !== null) {
        const title = match[1]
          .trim()
          .replace(/\s*\(\d{4}(?:-\d{4})?\).*$/, '')
          .replace(/\s*[-–]\s.*$/, '')
          .trim();
        
        if (title.length > 2 && title.length < 80 && !titles.includes(title)) {
          titles.push(title);
        }
      }
    }
    
    console.log('[Gemini Chat] Extracted', titles.length, 'titles:', titles.slice(0, 5));
    return titles.slice(0, 15);
  }

  private async getMediaFromTMDB(titles: string[], mediaTypes: string[] = ['movies']): Promise<TMDBMovie[]> {
    try {
      const { tmdbService } = await import('../tmdb');
      const foundTitles = new Set<string>();
      
      const includesMovies = mediaTypes.includes('movies') || mediaTypes.includes('both');
      const includesTV = mediaTypes.includes('tv') || mediaTypes.includes('both');
      
      // Search for all titles in parallel for much faster response
      const searchPromises = titles.slice(0, 15).map(async (title) => {
        try {
          const searchResults = await tmdbService.searchMulti(title);
          
          if (searchResults.results && searchResults.results.length > 0) {
            for (const item of searchResults.results) {
              const itemTitle = (item.title || item.name || '').toLowerCase();
              const searchTitle = title.toLowerCase();
              
              const isGoodMatch = itemTitle === searchTitle || 
                                itemTitle.includes(searchTitle) ||
                                searchTitle.includes(itemTitle);
              
              if (isGoodMatch) {
                const mediaTypeMatch = (includesMovies && item.media_type === 'movie') ||
                                      (includesTV && item.media_type === 'tv');
                
                if (mediaTypeMatch || mediaTypes.includes('both')) {
                  return item;
                }
              }
            }
          }
          return null;
        } catch (error) {
          console.error(`[Gemini Chat] Error searching for "${title}":`, error);
          return null;
        }
      });
      
      // Wait for all searches to complete
      const searchResults = await Promise.all(searchPromises);
      
      // Filter out nulls and duplicates
      const results: TMDBMovie[] = [];
      for (const item of searchResults) {
        if (item) {
          const itemTitle = (item.title || item.name || '').toLowerCase();
          if (!foundTitles.has(itemTitle)) {
            results.push(item);
            foundTitles.add(itemTitle);
          }
        }
      }
      
      return results;
    } catch (error) {
      console.error('[Gemini Chat] Error fetching from TMDB:', error);
      return [];
    }
  }

  private extractSuggestions(response: string, titles: string[]): string[] {
    const suggestions: string[] = [];
    
    if (titles.length > 0) {
      suggestions.push(`More like ${titles[0]}`);
    }
    
    const genres = ['action', 'comedy', 'drama', 'thriller', 'romance', 'sci-fi', 'horror'];
    for (const genre of genres) {
      if (response.toLowerCase().includes(genre)) {
        suggestions.push(`More ${genre} movies`);
        break;
      }
    }
    
    suggestions.push('Surprise me with something different');
    
    return suggestions.slice(0, 3);
  }

  private async getFallbackResponse(userMessage: string): Promise<MovieChatResponse> {
    const { tmdbService } = await import('../tmdb');
    
    try {
      const popularMovies = await tmdbService.getPopularMovies();
      const movies = (popularMovies.results || []).slice(0, 10);
      
      return {
        response: "I found some popular movies you might enjoy! These are currently trending and highly rated.",
        movies,
        suggestions: ['Action movies', 'Comedy films', 'Drama recommendations'],
        source: 'fallback'
      };
    } catch (error) {
      return {
        response: "I'm having trouble connecting right now. Please try again in a moment!",
        movies: [],
        suggestions: ['Try again', 'Popular movies', 'Top rated films'],
        source: 'fallback'
      };
    }
  }
}

export const geminiChatService = new GeminiChatService();
