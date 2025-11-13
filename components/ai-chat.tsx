import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Bot, User, Sparkles, ArrowDown, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import MovieCard from "@/components/movie-card";

interface ChatMessage {
  id: string;
  type: "user" | "ai";
  content: string;
  recommendations?: Array<{ title: string; rating: number; reason: string }>;
  movies?: any[]; // TMDB movie objects for rendering MovieCards
  queryInsights?: {
    detectedMood?: string;
    detectedGenres: string[];
    detectedKeywords: string[];
    yearPreference?: number;
    decadePreference?: string;
  };
  suggestions?: string[];
  source?: string;
  timestamp: Date;
}

interface AIChatProps {
  className?: string;
}

// MovieVanders-style natural language suggestions
const quickSuggestions = [
  { label: "😂 Something Funny", query: "I want something funny to laugh at" },
  { label: "🔥 Exciting Action", query: "show me thrilling action movies" },
  { label: "💕 Romantic Tonight", query: "romantic movies for date night" },
  { label: "😱 Scary Films", query: "I'm in the mood for something scary" },
  { label: "📼 90s Nostalgia", query: "classic movies from the 90s" },
  { label: "😊 Feel-Good Movies", query: "uplifting feel-good movies" },
  { label: "🤯 Mind-Bending", query: "thought-provoking intellectual films" },
  { label: "💎 Hidden Gems", query: "underrated movies I should watch" },
];

export default function AIChat({ className }: AIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = sessionStorage.getItem('aiChat_messages');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Convert timestamp strings back to Date objects
        return parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp)
        }));
      } catch {
        // If parsing fails, return default
      }
    }
    return [
      {
        id: "1",
        type: "ai",
        content: "👋 Hi! I'm your MovieVanders-powered AI assistant! 🎬✨ I understand natural language and can find movies that perfectly match your mood and preferences. Try asking me things like 'I want funny movies for tonight' 😂, 'something scary to watch' 😱, 'romantic films from the 90s' 💕, or even 'movies similar to Inception' 🤯. I'll analyze your request and provide personalized recommendations! 🍿",
        timestamp: new Date(),
      },
    ];
  });
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Persist messages to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('aiChat_messages', JSON.stringify(messages));
  }, [messages]);

  const scrollToBottom = (smooth = false) => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: smooth ? 'smooth' : 'auto'
        });
      }
    }
  };

  const handleScroll = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
        setShowScrollButton(!isNearBottom && scrollHeight > clientHeight);
      }
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const scrollContainer = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      // Initial check
      handleScroll();
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }
  }, []);

  // Auto-scroll to bottom when new messages arrive, but only if user was already at bottom
  useEffect(() => {
    if (messages.length > 1) { // Skip initial message
      const scrollContainer = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
        const wasNearBottom = scrollHeight - scrollTop - clientHeight < 150;
        if (wasNearBottom) {
          setTimeout(() => scrollToBottom(), 100); // Small delay to ensure content is rendered
        }
      }
    }
  }, [messages.length]);

  const generateAIResponse = async (userInput: string): Promise<ChatMessage> => {
    try {
      // Use the new AI chat endpoint that provides real TMDB movie data
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userInput,
          userId: 'user-1' // You can implement user sessions later
        })
      });

      if (response.ok) {
        const data = await response.json();
        console.log('AI Chat Response Data:', data);
        console.log('Movies Array Length:', data.movies ? data.movies.length : 0);
        console.log('Movies Array:', data.movies);
        
        const newMessage = {
          id: Date.now().toString(),
          type: "ai" as const,
          content: data.response,
          recommendations: data.recommendations,
          movies: data.movies || [], // TMDB movie objects for MovieCards
          queryInsights: data.queryInsights,
          suggestions: data.suggestions,
          source: data.source,
          timestamp: new Date(),
        };
        
        console.log('Created Message Object:', newMessage);
        console.log('Message movies length:', newMessage.movies.length);
        
        return newMessage;
      } else {
        throw new Error('API request failed');
      }
    } catch (error) {
      console.error('AI response error:', error);
      
      // Fallback response with helpful guidance
      return {
        id: Date.now().toString(),
        type: "ai",
        content: "I'd love to help you find the perfect movie! Tell me what you're in the mood for - like 'happy comedies', 'scary thrillers', 'romantic movies', or 'action adventures' - and I'll find great options for you!",
        timestamp: new Date(),
      };
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "user",
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    // Generate AI response with real API integration
    try {
      const aiResponse = await generateAIResponse(userMessage.content);
      setMessages(prev => [...prev, aiResponse]);
    } catch (error) {
      console.error('AI response error:', error);
      const fallbackResponse = {
        id: Date.now().toString(),
        type: "ai" as const,
        content: "I'm having trouble connecting right now. Please try asking again!",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, fallbackResponse]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Card className={cn("flex flex-col w-full max-w-7xl h-full", className)}>
      <CardHeader className="pb-2 px-3 sm:px-4 pt-2 sm:pt-3 flex-shrink-0">
        <CardTitle className="text-sm sm:text-base flex items-center space-x-2">
          <Bot className="h-4 w-4 text-accent flex-shrink-0" />
          <span>AI Movie Assistant</span>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-2 sm:p-3 pt-0 sm:pt-0 overflow-hidden">
        {/* Chat Messages Area - Takes available space and scrolls */}
        <div className="flex-1 relative min-h-0 overflow-hidden mb-2 sm:mb-3">
          <ScrollArea ref={scrollAreaRef} className="h-full max-h-full pr-1 sm:pr-2">
            <div className="space-y-3 sm:space-y-4 pb-2">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "chat-message flex items-start space-x-3",
                    message.type === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {message.type === "ai" && (
                    <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg bg-accent">
                      <Bot className="h-4 w-4 text-accent-foreground" />
                    </div>
                  )}
                  
                  <div
                    className={cn(
                      "rounded-lg p-3",
                      message.type === "user"
                        ? "bg-primary text-primary-foreground max-w-[85%] sm:max-w-[70%]"
                        : "bg-muted text-muted-foreground max-w-full sm:max-w-[95%]"
                    )}
                  >
                    <p className="text-sm whitespace-pre-line">{message.content}</p>

                    {message.movies && message.movies.length > 0 && (
                      <div className="mt-3 sm:mt-4 bg-gradient-to-r from-muted/30 to-muted/10 rounded-lg p-2 sm:p-3 md:p-4 border border-border/50" data-testid={`movie-cards-${message.id}`}>
                        <div className="flex flex-wrap items-center gap-2 mb-3 sm:mb-4">
                          <div className="flex items-center gap-1.5 sm:gap-2">
                            <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-yellow-500 flex-shrink-0" />
                            <span className="text-xs sm:text-sm font-semibold text-foreground">
                              AI Movie Recommendations
                            </span>
                          </div>
                          <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 py-0.5 sm:px-2">
                            {Math.min(message.movies.length, 8)} movies
                          </Badge>
                        </div>
                        
                        <div className="w-full overflow-hidden">
                          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                            {message.movies.slice(0, 8).map((movie: any, index: number) => {
                              // Convert TMDB movie format to our Movie format
                              const formattedMovie = {
                                id: movie.id.toString(),
                                title: movie.title || movie.name,
                                genre: movie.genre_ids?.[0] || 'Unknown',
                                year: movie.release_date ? new Date(movie.release_date).getFullYear() : 2024,
                                rating: movie.vote_average || 7.0,
                                synopsis: movie.overview || 'No description available',
                                director: 'Unknown',
                                cast: [],
                                posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : 'https://images.unsplash.com/photo-1489599558473-7636b88d6e6a?ixlib=rb-4.0.3&w=400&h=600&fit=crop',
                                type: movie.media_type === 'tv' ? 'tv' : 'movie',
                                duration: movie.runtime || null,
                                seasons: movie.number_of_seasons || null
                              };
                              
                              return (
                                <div key={movie.id} className="w-full min-w-0" data-testid={`movie-card-${movie.id}`}>
                                  <MovieCard
                                    movie={formattedMovie}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {message.type === "user" && (
                    <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg bg-primary">
                      <User className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))}
              
              {isLoading && (
                <div className="flex items-start space-x-3">
                  <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg bg-accent">
                    <Bot className="h-4 w-4 text-accent-foreground" />
                  </div>
                  <div className="bg-muted rounded-lg p-3">
                    <div className="flex space-x-1">
                      <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" />
                      <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                      <div className="h-2 w-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Scroll to bottom button */}
          {showScrollButton && (
            <Button
              onClick={() => scrollToBottom(true)}
              size="sm"
              className="absolute bottom-4 right-4 h-10 w-10 rounded-full shadow-lg z-10 hover:shadow-xl transition-all"
              variant="secondary"
              title="Scroll to bottom"
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        {/* Quick Movie Suggestions - Compact */}
        <div className="flex-shrink-0 mb-2">
          <div className="flex flex-wrap gap-1">
            {quickSuggestions.slice(0, 6).map((suggestion, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => setInputValue(suggestion.query)}
                className="text-[10px] sm:text-xs h-5 sm:h-6 px-1.5 sm:px-2"
                disabled={isLoading}
                data-testid={`button-suggestion-${index}`}
              >
                {suggestion.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex space-x-2 flex-shrink-0">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="What are you looking for? (e.g., 'funny comedies')"
            disabled={isLoading}
            className="flex-1"
            data-testid="input-chat-message"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            size="sm"
            data-testid="button-send-message"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
