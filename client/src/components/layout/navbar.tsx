import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Film, Tv, Sparkles, Heart, Menu, X, User, Settings, LogIn, LogOut, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth, logout } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { tmdbService } from "@/lib/tmdb";
import { NotificationBell } from "./NotificationBell";

const navItems = [
  { href: "/movies", label: "Movies", icon: Film },
  { href: "/tv-shows", label: "TV Shows", icon: Tv },
  { href: "/recommendations", label: "AI Recommendations", icon: Sparkles, isSpecial: true },
  { href: "/community", label: "Community", icon: Users },
  { href: "/my-list", label: "My List", icon: Heart },
];

export default function Navbar() {
  const [location, setLocation] = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const mobileSearchButtonRef = useRef<HTMLButtonElement>(null);
  const { user, isAuthenticated, isLoading } = useAuth();
  
  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch search suggestions
  const { data: suggestions, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['/api/tmdb/search/multi', debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery.trim() || debouncedQuery.length < 2) return { results: [] };
      const results = await tmdbService.searchMulti(debouncedQuery);
      return results;
    },
    enabled: debouncedQuery.length >= 2
  });

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as HTMLElement;
      
      // Don't close if clicking on a suggestion button or the mobile search button
      if (target.closest('button[data-testid^="suggestion-"]') || 
          target.closest('button[data-testid^="mobile-suggestion-"]') ||
          target.closest('button[data-testid="button-mobile-search"]')) {
        return;
      }
      
      // Close desktop search suggestions if clicking outside
      if (searchRef.current && !searchRef.current.contains(target)) {
        setShowSuggestions(false);
      }
      
      // Close mobile search panel if clicking outside
      if (mobileSearchRef.current && !mobileSearchRef.current.contains(target)) {
        if (mobileSearchButtonRef.current && !mobileSearchButtonRef.current.contains(target)) {
          setIsMobileSearchOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);
  
  const handleLogin = () => {
    setLocation('/login');
  };
  
  const handleLogout = () => {
    logout();
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setLocation(`/movies?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (result: any) => {
    const type = result.media_type || (result.title ? 'movie' : 'tv');
    setLocation(`/${type}/${result.id}`);
    setSearchQuery("");
    setShowSuggestions(false);
  };

  const searchResults = suggestions?.results?.slice(0, 6) || [];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex items-center flex-shrink-0">
            <Link href="/" className="flex items-center space-x-1.5 sm:space-x-2">
              <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-primary">
                <Film className="h-4 w-4 sm:h-5 sm:w-5 text-primary-foreground" />
              </div>
              <span className="text-lg sm:text-xl font-bold text-primary">CineGraph</span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-baseline space-x-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant="ghost"
                      className={cn(
                        "nav-link flex items-center space-x-2",
                        isActive && "active",
                        item.isSpecial && !isActive && "text-accent hover:text-accent"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Button>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Search and Profile */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            
            {/* Desktop Search */}
            <div ref={searchRef} className="relative hidden sm:block">
              <form onSubmit={handleSearch}>
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search movies, TV shows..."
                  className="w-48 lg:w-64 pl-10 pr-8"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => searchQuery.length >= 2 && setShowSuggestions(true)}
                  data-testid="input-search"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setSearchQuery("");
                      setShowSuggestions(false);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </form>

              {/* Suggestions Dropdown */}
              {showSuggestions && searchQuery.length >= 2 && (
                <div className="absolute top-full mt-2 w-full bg-background border border-border rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                  {suggestionsLoading ? (
                    <div className="p-4 flex items-center justify-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Searching...
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div className="py-2">
                      {searchResults.map((result: any) => {
                        const type = result.media_type || (result.title ? 'movie' : 'tv');
                        const title = result.title || result.name;
                        const year = result.release_date ? new Date(result.release_date).getFullYear() : 
                                    result.first_air_date ? new Date(result.first_air_date).getFullYear() : null;
                        const imageUrl = result.poster_path ? 
                          `https://image.tmdb.org/t/p/w92${result.poster_path}` : null;

                        return (
                          <button
                            type="button"
                            key={`${result.id}-${type}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleSuggestionClick(result);
                            }}
                            className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-muted/50 active:bg-muted transition-colors text-left touch-manipulation cursor-pointer"
                            data-testid={`suggestion-${result.id}`}
                          >
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={title}
                                className="w-10 h-14 object-cover rounded"
                              />
                            ) : (
                              <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
                                {type === 'movie' ? <Film className="h-5 w-5 text-muted-foreground" /> : <Tv className="h-5 w-5 text-muted-foreground" />}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium truncate">{title}</p>
                                {year && <span className="text-sm text-muted-foreground">({year})</span>}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                                  {type === 'movie' ? 'Movie' : 'TV Show'}
                                </span>
                                {result.vote_average > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    ⭐ {result.vote_average.toFixed(1)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-muted-foreground">
                      No results found for "{searchQuery}"
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mobile Search Button */}
            <Button
              ref={mobileSearchButtonRef}
              variant="ghost"
              size="sm"
              className="sm:hidden"
              onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
              data-testid="button-mobile-search"
            >
              <Search className="h-5 w-5" />
            </Button>

            {/* Notification Bell */}
            <NotificationBell />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 rounded-full p-0" data-testid="button-profile-menu">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user?.profileImageUrl || "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?ixlib=rb-4.0.3&w=32&h=32&fit=crop"} />
                    <AvatarFallback>{user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56" data-testid="dropdown-profile-menu">
                {isAuthenticated ? (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href="/profile" className="flex items-center" data-testid="link-profile">
                        <User className="mr-2 h-4 w-4" />
                        <span>Profile</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/settings" className="flex items-center" data-testid="link-settings">
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Settings</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      className="flex items-center text-red-600" 
                      onClick={handleLogout}
                      data-testid="button-logout"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Logout</span>
                    </DropdownMenuItem>
                  </>
                ) : (
                  <DropdownMenuItem 
                    className="flex items-center" 
                    onClick={handleLogin}
                    data-testid="button-login"
                  >
                    <LogIn className="mr-2 h-4 w-4" />
                    <span>Login</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            
            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="sm"
              className="md:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden">
            <div className="space-y-1 px-2 pb-3 pt-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start space-x-2",
                        isActive && "bg-primary text-primary-foreground",
                        item.isSpecial && !isActive && "text-accent"
                      )}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Button>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Mobile Search */}
        {isMobileSearchOpen && (
          <div className="md:hidden border-t border-border" ref={mobileSearchRef}>
            <div className="px-4 py-3">
              <form onSubmit={handleSearch} className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search movies, TV shows..."
                  className="w-full pl-10 pr-8"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => searchQuery.length >= 2 && setShowSuggestions(true)}
                  data-testid="input-mobile-search"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setSearchQuery("");
                      setShowSuggestions(false);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </form>

              {/* Mobile Suggestions */}
              {showSuggestions && searchQuery.length >= 2 && (
                <div className="mt-2 bg-background border border-border rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                  {suggestionsLoading ? (
                    <div className="p-4 flex items-center justify-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Searching...
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div className="py-2">
                      {searchResults.map((result: any) => {
                        const type = result.media_type || (result.title ? 'movie' : 'tv');
                        const title = result.title || result.name;
                        const year = result.release_date ? new Date(result.release_date).getFullYear() : 
                                    result.first_air_date ? new Date(result.first_air_date).getFullYear() : null;
                        const imageUrl = result.poster_path ? 
                          `https://image.tmdb.org/t/p/w92${result.poster_path}` : null;

                        return (
                          <button
                            type="button"
                            key={`mobile-${result.id}-${type}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleSuggestionClick(result);
                              setIsMobileSearchOpen(false);
                            }}
                            className="w-full px-4 py-3 flex items-center space-x-3 hover:bg-muted/50 active:bg-muted transition-colors text-left touch-manipulation cursor-pointer"
                            data-testid={`mobile-suggestion-${result.id}`}
                          >
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={title}
                                className="w-10 h-14 object-cover rounded"
                              />
                            ) : (
                              <div className="w-10 h-14 bg-muted rounded flex items-center justify-center">
                                {type === 'movie' ? <Film className="h-5 w-5 text-muted-foreground" /> : <Tv className="h-5 w-5 text-muted-foreground" />}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium truncate">{title}</p>
                                {year && <span className="text-sm text-muted-foreground">({year})</span>}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                                  {type === 'movie' ? 'Movie' : 'TV Show'}
                                </span>
                                {result.vote_average > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    ⭐ {result.vote_average.toFixed(1)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-muted-foreground">
                      No results found for "{searchQuery}"
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
