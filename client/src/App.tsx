import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorBoundary } from "@/components/error-boundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { useWebSocket } from "@/hooks/useWebSocket";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Movies from "@/pages/movies";
import TVShows from "@/pages/tvshows";
import Recommendations from "@/pages/recommendations";
import MyList from "@/pages/my-list";
import Profile from "@/pages/profile";
import Settings from "@/pages/settings";
import MovieDetails from "@/pages/movie-details";
import TVShowDetails from "@/pages/tv-show-details";
import Login from "@/pages/login";
import Community from "@/pages/community";
import ListDetail from "@/pages/list-detail";
import Notifications from "@/pages/notifications";
import Navbar from "@/components/layout/navbar";

function ScrollToTop() {
  const [location] = useLocation();
  
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  
  return null;
}

function Router() {
  // Initialize WebSocket connection for real-time updates
  useWebSocket();
  
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background">
        <ScrollToTop />
        <Navbar />
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/movies" component={Movies} />
          <Route path="/tv-shows" component={TVShows} />
          <Route path="/recommendations" component={Recommendations} />
          <Route path="/my-list" component={MyList} />
          <Route path="/community" component={Community} />
          <Route path="/lists/:id" component={ListDetail} />
          <Route path="/notifications" component={Notifications} />
          <Route path="/profile/:userId" component={Profile} />
          <Route path="/profile" component={Profile} />
          <Route path="/settings" component={Settings} />
          <Route path="/movie/:id" component={MovieDetails} />
          <Route path="/tv/:id" component={TVShowDetails} />
          <Route path="/login" component={Login} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </ErrorBoundary>
  );
}

function App() {
  // Initialize theme on app load
  useEffect(() => {
    const savedSettings = localStorage.getItem("userSettings");
    let theme = "system"; // default theme
    
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        theme = parsed.theme || "system";
      } catch (error) {
        console.error("Failed to parse saved settings:", error);
      }
    }
    
    const root = document.documentElement;
    
    // Remove all theme classes
    root.classList.remove("dark", "system");
    
    // Apply the selected theme class
    if (theme === "dark") {
      root.classList.add("dark");
    } else if (theme === "system") {
      root.classList.add("system");
    }
    // light theme has no class (uses default :root styles)
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
