// Enhanced sentiment analysis utility with Copilot API integration
// Falls back to dictionary-based approach if API is unavailable

interface SentimentResult {
  score: number; // -1 to 1, where -1 is very negative, 1 is very positive
  label: 'positive' | 'negative' | 'neutral';
  confidence: number; // 0 to 1
  emotions?: string[]; // Enhanced emotional insights from AI
  themes?: string[]; // Key themes identified in the text
}


// Basic sentiment word dictionaries
const positiveWords = new Set([
  'amazing', 'awesome', 'brilliant', 'excellent', 'fantastic', 'great', 'incredible',
  'love', 'wonderful', 'perfect', 'outstanding', 'superb', 'magnificent', 'beautiful',
  'good', 'nice', 'enjoy', 'enjoyed', 'fun', 'funny', 'hilarious', 'entertaining',
  'engaging', 'captivating', 'compelling', 'fascinating', 'interesting', 'exciting',
  'thrilling', 'spectacular', 'impressive', 'remarkable', 'phenomenal', 'extraordinary',
  'delightful', 'charming', 'pleasant', 'satisfying', 'worthwhile', 'recommend',
  'recommended', 'masterpiece', 'classic', 'gem', 'treasure', 'favorite', 'best',
  'top', 'stellar', 'five-star', 'exceptional', 'flawless', 'stunning', 'gorgeous',
  'adorable', 'cute', 'sweet', 'lovely', 'touching', 'heartwarming', 'inspiring',
  'uplifting', 'refreshing', 'innovative', 'creative', 'original', 'unique', 'clever'
]);

const negativeWords = new Set([
  'awful', 'terrible', 'horrible', 'bad', 'worst', 'hate', 'disappointing',
  'boring', 'dull', 'stupid', 'waste', 'poor', 'mediocre', 'weak', 'lame',
  'pathetic', 'ridiculous', 'annoying', 'frustrating', 'confusing', 'messy',
  'slow', 'dragging', 'tedious', 'pointless', 'meaningless', 'shallow', 'empty',
  'flat', 'unconvincing', 'unrealistic', 'predictable', 'cliche', 'overrated',
  'underperformed', 'failed', 'disaster', 'mess', 'joke', 'trash', 'garbage',
  'unwatchable', 'unbearable', 'painful', 'cringe', 'crappy', 'sucks', 'lacking',
  'disappointing', 'letdown', 'failure', 'flop', 'bomb', 'skip', 'avoid', 'regret'
]);

// Intensifiers that modify sentiment strength
const intensifiers = new Map([
  ['very', 1.5],
  ['extremely', 2.0],
  ['incredibly', 1.8],
  ['absolutely', 1.7],
  ['totally', 1.6],
  ['completely', 1.7],
  ['really', 1.3],
  ['quite', 1.2],
  ['pretty', 1.1],
  ['somewhat', 0.8],
  ['slightly', 0.7],
  ['a bit', 0.6],
  ['kind of', 0.6],
  ['sort of', 0.6]
]);

// Negation words that flip sentiment
const negationWords = new Set([
  'not', 'no', 'never', 'nothing', 'nowhere', 'nobody', 'none', 'neither',
  'nor', 'hardly', 'barely', 'scarcely', 'rarely', 'seldom', 'cannot', "can't",
  "won't", "wouldn't", "shouldn't", "couldn't", "don't", "doesn't", "didn't"
]);

// Enhanced sentiment analysis using Gemini AI
export async function analyzeSentimentEnhanced(text: string): Promise<SentimentResult> {
  if (!text || text.trim().length === 0) {
    return { score: 0, label: 'neutral', confidence: 0 };
  }

  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    
    if (!apiKey) {
      console.log('GEMINI_API_KEY not available, falling back to basic sentiment analysis');
      return analyzeSentiment(text);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const prompt = `Analyze the sentiment of the following review text and provide a JSON response with the following structure:
{
  "score": <number between -1 and 1, where -1 is very negative, 0 is neutral, and 1 is very positive>,
  "label": <"positive" | "negative" | "neutral">,
  "confidence": <number between 0 and 1 indicating how confident you are in this assessment>,
  "emotions": <array of 2-3 key emotions detected, e.g., ["joy", "excitement"]>,
  "themes": <array of 2-3 main themes or topics mentioned, e.g., ["acting", "plot"]>
}

Review text: "${text.replace(/"/g, '\\"')}"

Return only the JSON object, no other text.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();
    
    // Extract JSON from response (handle potential markdown formatting)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('Failed to extract JSON from Gemini response, falling back');
      return analyzeSentiment(text);
    }

    const aiResult = JSON.parse(jsonMatch[0]);
    
    return {
      score: Math.max(-1, Math.min(1, aiResult.score)),
      label: aiResult.label,
      confidence: Math.max(0, Math.min(1, aiResult.confidence)),
      emotions: aiResult.emotions || [],
      themes: aiResult.themes || []
    };
  } catch (error) {
    console.error('Error in AI sentiment analysis:', error);
    return analyzeSentiment(text);
  }
}


// Original basic sentiment analysis (fallback)
export function analyzeSentiment(text: string): SentimentResult {
  if (!text || text.trim().length === 0) {
    return { score: 0, label: 'neutral', confidence: 0 };
  }

  // Clean and tokenize the text
  const cleanText = text.toLowerCase().replace(/[^\w\s]/g, ' ');
  const words = cleanText.split(/\s+/).filter(word => word.length > 0);

  if (words.length === 0) {
    return { score: 0, label: 'neutral', confidence: 0 };
  }

  let totalScore = 0;
  let wordCount = 0;
  let negated = false;
  let intensifierMultiplier = 1;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    
    // Check for negation
    if (negationWords.has(word)) {
      negated = true;
      continue;
    }

    // Check for intensifiers
    if (intensifiers.has(word)) {
      intensifierMultiplier = intensifiers.get(word) || 1;
      continue;
    }

    // Score sentiment words
    let wordScore = 0;
    if (positiveWords.has(word)) {
      wordScore = 1;
    } else if (negativeWords.has(word)) {
      wordScore = -1;
    }

    if (wordScore !== 0) {
      // Apply intensifier
      wordScore *= intensifierMultiplier;
      
      // Apply negation
      if (negated) {
        wordScore *= -1;
        negated = false; // Reset negation after applying
      }

      totalScore += wordScore;
      wordCount++;
      
      // Reset intensifier after applying
      intensifierMultiplier = 1;
    }

    // Reset negation after a few words if no sentiment word found
    if (negated && i > 0 && words.length > i + 2) {
      negated = false;
    }
  }

  // Calculate final score
  const avgScore = wordCount > 0 ? totalScore / wordCount : 0;
  
  // Normalize score to -1 to 1 range
  const normalizedScore = Math.max(-1, Math.min(1, avgScore));
  
  // Calculate confidence based on number of sentiment words found
  const confidence = Math.min(1, wordCount / Math.max(5, words.length * 0.3));
  
  // Determine label
  let label: 'positive' | 'negative' | 'neutral';
  if (normalizedScore > 0.1) {
    label = 'positive';
  } else if (normalizedScore < -0.1) {
    label = 'negative';
  } else {
    label = 'neutral';
  }

  return {
    score: Math.round(normalizedScore * 100) / 100, // Round to 2 decimal places
    label,
    confidence: Math.round(confidence * 100) / 100
  };
}

// Helper function to get sentiment summary for multiple reviews
export async function getSentimentSummary(reviews: Array<{ review?: string | null; sentimentScore?: number | null }>): Promise<{
  avgScore: number;
  distribution: { positive: number; negative: number; neutral: number };
  totalReviews: number;
}> {
  const validReviews = reviews.filter(r => r.review && r.review.trim().length > 0);
  
  if (validReviews.length === 0) {
    return {
      avgScore: 0,
      distribution: { positive: 0, negative: 0, neutral: 0 },
      totalReviews: 0
    };
  }

  let totalScore = 0;
  const distribution = { positive: 0, negative: 0, neutral: 0 };

  for (const review of validReviews) {
    let score = review.sentimentScore;
    
    // If sentiment score is not available, analyze the review text with AI
    if (score === null || score === undefined) {
      if (review.review) {
        const sentiment = await analyzeSentimentEnhanced(review.review);
        score = sentiment.score;
      } else {
        score = 0;
      }
    }

    totalScore += score;

    // Categorize sentiment
    if (score > 0.1) {
      distribution.positive++;
    } else if (score < -0.1) {
      distribution.negative++;
    } else {
      distribution.neutral++;
    }
  }

  return {
    avgScore: Math.round((totalScore / validReviews.length) * 100) / 100,
    distribution,
    totalReviews: validReviews.length
  };
}

// Helper to generate sentiment-based insights
export function getSentimentInsights(summary: {
  avgScore: number;
  distribution: { positive: number; negative: number; neutral: number };
  totalReviews: number;
}): string[] {
  const insights: string[] = [];
  const { avgScore, distribution, totalReviews } = summary;

  if (totalReviews === 0) {
    return ['No reviews available for sentiment analysis.'];
  }

  // Overall sentiment insight
  if (avgScore > 0.3) {
    insights.push('Overall sentiment is highly positive');
  } else if (avgScore > 0.1) {
    insights.push('Overall sentiment is positive');
  } else if (avgScore < -0.3) {
    insights.push('Overall sentiment is negative');
  } else if (avgScore < -0.1) {
    insights.push('Overall sentiment is slightly negative');
  } else {
    insights.push('Overall sentiment is neutral');
  }

  // Distribution insights
  const positivePercentage = (distribution.positive / totalReviews) * 100;
  const negativePercentage = (distribution.negative / totalReviews) * 100;

  if (positivePercentage > 70) {
    insights.push(`${Math.round(positivePercentage)}% of reviews are positive`);
  }
  
  if (negativePercentage > 30) {
    insights.push(`${Math.round(negativePercentage)}% of reviews express concerns`);
  }

  // Sample size insight
  if (totalReviews < 5) {
    insights.push('Limited reviews available - sentiment may not be representative');
  } else if (totalReviews > 50) {
    insights.push('Strong sample size provides reliable sentiment analysis');
  }

  return insights;
}

// Generate AI-powered review summary for a movie/TV show
export async function generateReviewSummary(
  reviews: Array<{ review?: string | null; rating?: number | null }>,
  title: string,
  mediaType: string
): Promise<string> {
  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    
    if (!apiKey) {
      return '';
    }

    // Filter valid reviews with content
    const validReviews = reviews
      .filter(r => r.review && r.review.trim().length > 0)
      .slice(0, 10); // Limit to 10 reviews for API efficiency

    if (validReviews.length === 0) {
      return '';
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const reviewTexts = validReviews.map((r, i) => `Review ${i + 1}: ${r.review}`).join('\n\n');

    const prompt = `Based on the following audience reviews for the ${mediaType} "${title}", write a concise 2-3 sentence summary that captures:
1. The overall consensus about the ${mediaType}
2. What viewers particularly enjoyed or criticized
3. Who would enjoy this ${mediaType}

Reviews:
${reviewTexts}

Provide a natural, engaging summary that helps potential viewers decide if this ${mediaType} is right for them. Keep it under 100 words.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const summary = response.text();
    
    return summary.trim();
  } catch (error) {
    console.error('Error generating AI review summary:', error);
    return '';
  }
}