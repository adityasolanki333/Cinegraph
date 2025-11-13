import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import MovieCard from "@/components/movie-card";
import { tmdbService } from "@/lib/tmdb";
import { User, Heart, Star, Calendar, TrendingUp, Eye, Film, Tv, Settings, Edit3, BookOpen, Clock, ListChecks, Database, Key, Plus, Loader2, Users as UsersIcon, Trophy, List as ListIcon, UserPlus, UserMinus, Sparkles } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Movie } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, Link, useRoute } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CreateListDialog } from "@/components/create-list-dialog";
import { ListCard } from "@/components/list-card";
import { UserBadges } from "@/components/UserBadges";
import { UserImpactDashboard } from "@/components/user-impact-dashboard";
import { getLevelBadge, getLevelProgress, userIdToUsername } from "@shared/helpers";

export default function Profile() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [bio, setBio] = useState("");
  const { toast } = useToast();
  
  // Get username from route params (if viewing another user's profile)
  const [match, params] = useRoute("/profile/:username");
  const username = params?.username;
  
  // Redirect if not authenticated (in useEffect to avoid render-time side effects)
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      setLocation('/login');
    }
  }, [authLoading, isAuthenticated, setLocation]);

  // Fetch profile user data by username
  const { data: profileUser } = useQuery({
    queryKey: ['/api/users/by-username', username],
    queryFn: async () => {
      if (!username) return user; // Own profile
      const response = await fetch(`/api/users/by-username/${username}`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!username || !!user,
  });

  const displayUser = username ? profileUser : user;
  const profileUserId = displayUser?.id;
  const isOwnProfile = !username || displayUser?.id === user?.id;


  // Get user's name and initials
  const getDisplayName = () => {
    if (displayUser?.firstName && displayUser?.lastName) {
      return `${displayUser.firstName} ${displayUser.lastName}`;
    }
    if (displayUser?.email) {
      // Extract username from email (part before @)
      const username = displayUser.email.split('@')[0];
      // Replace underscores and dots with spaces, capitalize first letter
      return username
        .replace(/[._]/g, ' ')
        .split(' ')
        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
    return "User";
  };
  
  const displayName = getDisplayName();
  
  const initials = displayUser?.firstName && displayUser?.lastName
    ? `${displayUser.firstName[0]}${displayUser.lastName[0]}`
    : displayUser?.email?.[0]?.toUpperCase() || "U";

  // Fetch user's real ratings from the database
  const { data: userRatings, isLoading: ratingsLoading } = useQuery({
    queryKey: ['/api/users', profileUserId, 'ratings'],
    queryFn: async () => {
      if (!profileUserId) return [];
      const response = await fetch(`/api/users/${profileUserId}/ratings`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!profileUserId,
  });

  // Fetch user's real favorites from the database
  const { data: userFavorites, isLoading: favoritesLoading } = useQuery({
    queryKey: ['/api/users', profileUserId, 'favorites'],
    queryFn: async () => {
      if (!profileUserId) return [];
      const response = await fetch(`/api/users/${profileUserId}/favorites`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!profileUserId,
  });

  // Fetch user's watched items from the database
  const { data: userWatched, isLoading: watchedLoading } = useQuery({
    queryKey: ['/api/users', profileUserId, 'watched'],
    queryFn: async () => {
      if (!profileUserId) return [];
      const response = await fetch(`/api/users/${profileUserId}/watched`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!profileUserId,
  });

  // Fetch user's watchlist from the database
  const { data: userWatchlist, isLoading: watchlistLoading } = useQuery({
    queryKey: ['/api/users', profileUserId, 'watchlist'],
    queryFn: async () => {
      if (!profileUserId) return [];
      const response = await fetch(`/api/users/${profileUserId}/watchlist`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!profileUserId,
    staleTime: 0,
    refetchOnMount: true,
  });

  // Fetch user's community stats (followers, following, level)
  const { data: userStats, isLoading: statsLoading } = useQuery<{
    experiencePoints: number;
    totalFollowers: number;
    totalFollowing: number;
    totalReviews: number;
    totalLists: number;
    totalAwardsGiven: number;
    totalAwardsReceived: number;
  }>({
    queryKey: ['/api/community', profileUserId, 'stats'],
    enabled: !!profileUserId,
  });

  // Fetch user's lists
  const { data: userLists, isLoading: listsLoading } = useQuery({
    queryKey: ['/api/community/users', profileUserId, 'lists'],
    enabled: !!profileUserId,
  });

  // Check if current user is following the profile user
  const { data: followStatus } = useQuery({
    queryKey: ['/api/community/following', profileUserId],
    queryFn: async () => {
      if (isOwnProfile || !user?.id || !profileUserId) return { isFollowing: false };
      const response = await fetch(`/api/community/${user.id}/following/${profileUserId}`);
      if (!response.ok) return { isFollowing: false };
      return response.json();
    },
    enabled: !isOwnProfile && !!user?.id && !!profileUserId,
  });

  // Follow/Unfollow mutation
  const followMutation = useMutation({
    mutationFn: async (action: 'follow' | 'unfollow') => {
      if (!user?.id || !profileUserId) throw new Error("User not found");
      const response = await apiRequest(
        "POST",
        `/api/community/follow`,
        { targetUserId: profileUserId, action }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/following', profileUserId] });
      queryClient.invalidateQueries({ queryKey: ['/api/community', profileUserId, 'stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community', user?.id, 'stats'] });
    },
  });

  // Get trending data for recommendations
  const { data: trendingData, isLoading: trendingLoading } = useQuery({
    queryKey: ['/api/tmdb/trending'],
    select: (data: any) => {
      if (!data.results) return [];
      return data.results.slice(0, 6).map((item: any) => 
        tmdbService.convertToMovie(item, item.media_type || 'movie')
      );
    }
  });

  // Calculate real viewing stats from user data
  const viewingStats = useMemo(() => {
    const ratings = userRatings || [];
    const favoriteItems = userFavorites || [];
    const watchedItems = userWatched || [];
    const watchlistItems = userWatchlist || [];
    
    // Calculate average rating
    const avgRating = ratings.length > 0
      ? ratings.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / ratings.length
      : 0;
    
    // Separate movies and TV shows from ratings
    const ratedMovies = ratings.filter((r: any) => r.mediaType === 'movie');
    const ratedTVShows = ratings.filter((r: any) => r.mediaType === 'tv');
    
    return {
      totalWatched: watchedItems.length,
      totalHours: watchedItems.length * 2, // Estimate 2 hours per item
      avgRating: avgRating,
      watchlistCount: watchlistItems.length,
      favoritesCount: favoriteItems.length,
      reviewsCount: ratings.filter((r: any) => r.review).length,
      ratedMovies,
      ratedTVShows
    };
  }, [userRatings, userFavorites, userWatched, userWatchlist]);

  // Get user's favorite genres based on ratings
  const favoriteGenres = useMemo(() => {
    if (!userRatings || userRatings.length === 0) return [];
    
    // This would ideally fetch genre data from TMDB for each rated item
    // For now, return placeholder genres
    return ["Action", "Sci-Fi", "Drama", "Comedy"];
  }, [userRatings]);

  const handleAddToWatchlist = (movieId: string) => {
    setWatchlist(prev => [...prev, movieId]);
  };

  const handleRemoveFromWatchlist = (movieId: string) => {
    setWatchlist(prev => prev.filter(id => id !== movieId));
  };

  // Mutation for updating user profile
  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; bio?: string }) => {
      if (!user?.id) throw new Error("User not found");
      const response = await apiRequest("PATCH", `/api/users/${user.id}`, data);
      return response.json();
    },
    onSuccess: async (updatedUser) => {
      // Update localStorage with the new user data
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const currentUser = JSON.parse(storedUser);
        const newUser = { ...currentUser, ...updatedUser };
        localStorage.setItem('user', JSON.stringify(newUser));
        
        // Trigger a storage event to update other components
        window.dispatchEvent(new Event('storage'));
      }
      
      // Invalidate queries to refetch fresh data
      await queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'ratings'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'favorites'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'watched'] });
      
      // Close dialog and show success message
      setIsEditDialogOpen(false);
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  // Handle opening the edit dialog
  const handleOpenEditDialog = () => {
    setFirstName(user?.firstName || "");
    setLastName(user?.lastName || "");
    setBio(user?.bio || "");
    setIsEditDialogOpen(true);
  };

  // Handle form submission
  const handleUpdateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast({
        title: "Error",
        description: "First name and last name are required",
        variant: "destructive",
      });
      return;
    }
    updateProfileMutation.mutate({ firstName, lastName, bio });
  };

  const levelInfo = getLevelBadge(userStats?.experiencePoints || 0);

  // Show loading state
  if (authLoading || ratingsLoading || favoritesLoading || watchedLoading || watchlistLoading || statsLoading || listsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      {/* Profile Header with Real User Data */}
      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 mb-8">
        {/* User Info */}
        <Card className="lg:w-1/3 w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <Avatar className="h-24 w-24 sm:h-32 sm:w-32 mb-4">
                <AvatarImage src={displayUser?.profileImageUrl || undefined} alt={displayName} />
                <AvatarFallback className="text-xl sm:text-2xl">{initials}</AvatarFallback>
              </Avatar>
              
              <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-1" data-testid="text-user-name">{displayName}</h1>
              <p className="text-sm text-muted-foreground mb-2" data-testid="text-user-email">{displayUser?.email || ""}</p>
              
              {displayUser?.bio && (
                <p className="text-sm text-muted-foreground mb-3 max-w-md text-center" data-testid="text-user-bio">
                  {displayUser.bio}
                </p>
              )}
              
              <Badge className={`${levelInfo.color} text-white mb-3 shadow-lg animate-in fade-in-50 slide-in-from-bottom-2`} data-testid="badge-user-level">
                <Trophy className="h-3 w-3 mr-1 animate-pulse" />
                {levelInfo.name}
              </Badge>
              
              {/* XP Progress Bar */}
              <div className="w-full max-w-xs mb-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{userStats?.experiencePoints || 0} XP</span>
                  <span>{levelInfo.max === Infinity ? 'Max Level!' : `${levelInfo.max} XP`}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${levelInfo.color} transition-all duration-500`}
                    style={{ 
                      width: `${getLevelProgress(userStats?.experiencePoints || 0)}%` 
                    }}
                  />
                </div>
              </div>
              
              <div className="flex items-center text-sm text-muted-foreground mb-4">
                <Calendar className="h-4 w-4 mr-2" />
                <span>Joined {displayUser?.createdAt ? new Date(displayUser.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Recently'}</span>
              </div>

              <div className="flex items-center gap-6 mb-6 text-sm">
                <Link href="/community" className="flex items-center gap-1 hover:underline">
                  <span className="font-semibold" data-testid="stat-followers">{userStats?.totalFollowers || 0}</span>
                  <span className="text-muted-foreground">Followers</span>
                </Link>
                <Link href="/community" className="flex items-center gap-1 hover:underline">
                  <span className="font-semibold" data-testid="stat-following">{userStats?.totalFollowing || 0}</span>
                  <span className="text-muted-foreground">Following</span>
                </Link>
              </div>

              <div className="flex gap-2 mb-4 flex-wrap justify-center">
                {favoriteGenres.map((genre: string) => (
                  <Badge key={genre} variant="secondary">{genre}</Badge>
                ))}
              </div>

              {isOwnProfile ? (
                <div className="flex gap-2 w-full max-w-sm">
                  <Button size="sm" className="flex-1" data-testid="button-edit-profile" onClick={handleOpenEditDialog}>
                    <Edit3 className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Edit Profile</span>
                    <span className="sm:hidden">Edit</span>
                  </Button>
                  <Button size="sm" variant="outline" data-testid="button-settings">
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2 w-full max-w-sm">
                  <Button 
                    size="sm" 
                    className="flex-1" 
                    data-testid="button-follow"
                    onClick={() => followMutation.mutate(followStatus?.isFollowing ? 'unfollow' : 'follow')}
                    disabled={followMutation.isPending}
                  >
                    {followMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : followStatus?.isFollowing ? (
                      <>
                        <UserMinus className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">Unfollow</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">Follow</span>
                      </>
                    )}
                    <span className="sm:hidden">{followStatus?.isFollowing ? 'Unfollow' : 'Follow'}</span>
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Viewing Stats - Real Data */}
        <div className="lg:w-2/3 w-full grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          <Card>
            <CardContent className="p-3 sm:p-4 text-center">
              <Heart className="h-6 w-6 sm:h-8 sm:w-8 mx-auto text-accent mb-2" />
              <div className="text-xl sm:text-2xl font-bold text-foreground" data-testid="stat-watchlist">{viewingStats.watchlistCount}</div>
              <div className="text-xs sm:text-sm text-muted-foreground">Watchlist</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-3 sm:p-4 text-center">
              <Film className="h-6 w-6 sm:h-8 sm:w-8 mx-auto text-accent mb-2" />
              <div className="text-xl sm:text-2xl font-bold text-foreground" data-testid="stat-watched">{viewingStats.totalWatched}</div>
              <div className="text-xs sm:text-sm text-muted-foreground">Watched</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-3 sm:p-4 text-center">
              <Star className="h-6 w-6 sm:h-8 sm:w-8 mx-auto text-accent mb-2" />
              <div className="text-xl sm:text-2xl font-bold text-foreground" data-testid="stat-avg-rating">{viewingStats.avgRating.toFixed(1)}</div>
              <div className="text-xs sm:text-sm text-muted-foreground">Avg Rating</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-3 sm:p-4 text-center">
              <Star className="h-6 w-6 sm:h-8 sm:w-8 mx-auto text-accent mb-2" />
              <div className="text-xl sm:text-2xl font-bold text-foreground" data-testid="stat-total-rated">{userRatings?.length || 0}</div>
              <div className="text-xs sm:text-sm text-muted-foreground">Total Rated</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-3 sm:p-4 text-center">
              <Heart className="h-6 w-6 sm:h-8 sm:w-8 mx-auto text-accent mb-2" />
              <div className="text-xl sm:text-2xl font-bold text-foreground" data-testid="stat-favorites-count">{viewingStats.favoritesCount}</div>
              <div className="text-xs sm:text-sm text-muted-foreground">Favorites</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-3 sm:p-4 text-center">
              <User className="h-6 w-6 sm:h-8 sm:w-8 mx-auto text-accent mb-2" />
              <div className="text-xl sm:text-2xl font-bold text-foreground" data-testid="stat-reviews">{viewingStats.reviewsCount}</div>
              <div className="text-xs sm:text-sm text-muted-foreground">With Reviews</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* User Badges Section */}
      {profileUserId && (
        <div className="mb-8">
          <UserBadges userId={profileUserId} />
        </div>
      )}

      {/* Tabbed Content - My Impact, My Lists, and Rated Items */}
      <Tabs defaultValue={isOwnProfile ? "impact" : "lists"} className="w-full">
        <TabsList className={`grid w-full ${isOwnProfile ? 'grid-cols-3' : 'grid-cols-2'} max-w-2xl mb-6`} data-testid="tabs-profile">
          {isOwnProfile && (
            <TabsTrigger value="impact" data-testid="tab-my-impact">
              <Sparkles className="h-4 w-4 mr-2" />
              My Impact
            </TabsTrigger>
          )}
          <TabsTrigger value="lists" data-testid="tab-my-lists">
            <ListIcon className="h-4 w-4 mr-2" />
            {isOwnProfile ? 'My Lists' : 'Lists'}
          </TabsTrigger>
          <TabsTrigger value="rated" data-testid="tab-rated-items">
            <Star className="h-4 w-4 mr-2" />
            Rated Items
          </TabsTrigger>
        </TabsList>

        {/* My Lists Tab */}
        <TabsContent value="lists">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <ListIcon className="h-5 w-5" />
                  {isOwnProfile ? 'My Lists' : `${displayUser?.firstName}'s Lists`}
                </CardTitle>
                {isOwnProfile && <CreateListDialog />}
              </div>
            </CardHeader>
            <CardContent>
              {userLists && Array.isArray(userLists) && userLists.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {userLists.map((list: any) => (
                    <ListCard key={list.id} list={list} showAuthor={false} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <ListIcon className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    {isOwnProfile ? "You haven't created any lists yet" : "This user hasn't created any lists yet"}
                  </p>
                  {isOwnProfile && (
                    <CreateListDialog trigger={
                      <Button>
                        <Plus className="h-4 w-4 mr-2" />
                        Create Your First List
                      </Button>
                    } />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rated Items Tab */}
        <TabsContent value="rated">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5" />
                Rated Items
              </CardTitle>
            </CardHeader>
            <CardContent>
              {userRatings && userRatings.length > 0 ? (
                <div className="space-y-2">
                  {userRatings.map((item: any) => (
                    <Link 
                      key={item.id} 
                      href={item.mediaType === 'movie' ? `/movie/${item.tmdbId}` : `/tv/${item.tmdbId}`}
                      data-testid={`link-rated-item-${item.id}`}
                    >
                      <div className="p-3 border rounded hover:bg-accent transition-colors cursor-pointer" data-testid={`rated-item-${item.id}`}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium flex-1" data-testid={`rated-title-${item.id}`}>
                            {item.title || item.name}
                          </p>
                          <div className="flex items-center gap-1" data-testid={`rated-stars-${item.id}`}>
                            {[...Array(5)].map((_, i) => (
                              <Star 
                                key={i} 
                                className={`h-4 w-4 ${i < (item.rating || 0) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                              />
                            ))}
                            <span className="text-sm ml-1">{item.rating || 0}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-xs" data-testid={`rated-mediatype-${item.id}`}>
                            {item.mediaType === 'movie' ? <Film className="h-3 w-3 mr-1" /> : <Tv className="h-3 w-3 mr-1" />}
                            {item.mediaType === 'movie' ? 'Movie' : 'TV Show'}
                          </Badge>
                        </div>
                        {item.review && (
                          <p className="text-xs text-muted-foreground mt-2" data-testid={`rated-review-${item.id}`}>
                            {item.review}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Star className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No rated items yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* My Impact Tab */}
        {isOwnProfile && profileUserId && (
          <TabsContent value="impact" className="space-y-6" data-testid="tab-content-my-impact">
            <UserImpactDashboard userId={profileUserId} />
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Profile Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-profile">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>
              Update your profile information. Click save when you're done.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateProfile}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  data-testid="input-first-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Enter your first name"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  data-testid="input-last-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Enter your last name"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  data-testid="input-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell us about yourself (optional)"
                  maxLength={500}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">{bio.length}/500 characters</p>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditDialogOpen(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateProfileMutation.isPending}
                data-testid="button-save-profile"
              >
                {updateProfileMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}