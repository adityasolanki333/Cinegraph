import { useState } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReviewCardEnhanced } from "@/components/review-card-enhanced";
import { 
  Users, 
  Star, 
  TrendingUp, 
  MessageSquare, 
  Heart, 
  List,
  Award,
  Clock,
  Search,
  Trophy
} from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { getLevelBadge, AWARD_TYPES, userIdToUsername } from "@shared/helpers";
import type {
  FeedItem,
  TopReview,
  TrendingContent,
  LeaderboardsResponse,
  RecommendedList,
  SimilarUser,
  SearchListResult,
  SearchUserResult,
} from "@shared/api-types";

type TimeFilter = 'daily' | 'weekly' | 'monthly';
type SortBy = 'awards' | 'comments' | 'helpful';

export default function Community() {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('weekly');
  const [sortBy, setSortBy] = useState<SortBy>('awards');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'lists' | 'users'>('lists');
  const { user } = useAuth();

  const { data: activityPrompts, isLoading: promptsLoading } = useQuery<any[]>({
    queryKey: [`/api/community/activity-prompts/${user?.id}`],
    enabled: !!user?.id,
    refetchInterval: 60000,
  });

  const { 
    data: feedData, 
    isLoading: feedLoading,
    fetchNextPage: fetchNextFeedPage,
    hasNextPage: hasNextFeedPage,
    isFetchingNextPage: isFetchingNextFeedPage
  } = useInfiniteQuery({
    queryKey: ['/api/community/community-feed', timeFilter],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await fetch(`/api/community/community-feed?timeFilter=${timeFilter}&offset=${pageParam}`);
      if (!response.ok) throw new Error('Failed to fetch feed');
      return response.json();
    },
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextOffset : undefined,
    initialPageParam: 0,
    refetchInterval: 30000,
  });

  const { 
    data: topReviewsData, 
    isLoading: topReviewsLoading,
    fetchNextPage: fetchNextReviewsPage,
    hasNextPage: hasNextReviewsPage,
    isFetchingNextPage: isFetchingNextReviewsPage
  } = useInfiniteQuery({
    queryKey: ['/api/community/top-reviews', timeFilter, sortBy],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await fetch(`/api/community/top-reviews?timeFilter=${timeFilter}&sortBy=${sortBy}&offset=${pageParam}`);
      if (!response.ok) throw new Error('Failed to fetch top reviews');
      return response.json();
    },
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextOffset : undefined,
    initialPageParam: 0,
    refetchInterval: 30000,
  });

  const { data: leaderboards, isLoading: leaderboardsLoading } = useQuery({
    queryKey: ['/api/community/leaderboards'],
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });

  const { 
    data: trendingData, 
    isLoading: trendingLoading,
    fetchNextPage: fetchNextTrendingPage,
    hasNextPage: hasNextTrendingPage,
    isFetchingNextPage: isFetchingNextTrendingPage
  } = useInfiniteQuery({
    queryKey: ['/api/community/trending', timeFilter],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await fetch(`/api/community/trending?timeFilter=${timeFilter}&offset=${pageParam}`);
      if (!response.ok) throw new Error('Failed to fetch trending');
      return response.json();
    },
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextOffset : undefined,
    initialPageParam: 0,
    refetchInterval: 30000,
  });

  const { data: searchListsResults, isLoading: searchListsLoading } = useQuery({
    queryKey: [`/api/community/lists/search?q=${encodeURIComponent(searchQuery)}`],
    enabled: searchQuery.trim().length > 0 && searchType === 'lists',
  });

  const { data: searchUsersResults, isLoading: searchUsersLoading } = useQuery({
    queryKey: [`/api/community/users/search?q=${encodeURIComponent(searchQuery)}`],
    enabled: searchQuery.trim().length > 0 && searchType === 'users',
  });

  const { data: recommendedLists, isLoading: recommendedListsLoading } = useQuery({
    queryKey: [`/api/community/lists/recommended/${user?.id}`],
    enabled: !!user?.id,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  const { data: similarUsers, isLoading: similarUsersLoading } = useQuery({
    queryKey: [`/api/community/users/${user?.id}/similar`],
    enabled: !!user?.id,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  const { 
    data: personalizedFeedData, 
    isLoading: personalizedFeedLoading,
    fetchNextPage: fetchNextPersonalizedPage,
    hasNextPage: hasNextPersonalizedPage,
    isFetchingNextPage: isFetchingNextPersonalizedPage
  } = useInfiniteQuery({
    queryKey: [`/api/community/personalized-feed/${user?.id}`, timeFilter],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await fetch(`/api/community/personalized-feed/${user?.id}?timeFilter=${timeFilter}&offset=${pageParam}`);
      if (!response.ok) throw new Error('Failed to fetch personalized feed');
      return response.json();
    },
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextOffset : undefined,
    initialPageParam: 0,
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 text-foreground dark:text-foreground" data-testid="heading-community">
          Community
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground dark:text-muted-foreground">
          Discover what the CineGraph community is watching, reviewing, and recommending
        </p>
      </div>

      {/* Activity Prompts - Community Flywheel */}
      {user && activityPrompts && Array.isArray(activityPrompts) && activityPrompts.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="activity-prompts">
          {activityPrompts.map((prompt: any) => (
            <Card key={prompt.id} className="border-l-4 border-l-primary hover:shadow-lg transition-shadow" data-testid={`prompt-${prompt.type}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      {prompt.type === 'review' && <MessageSquare className="h-4 w-4 text-primary" />}
                      {prompt.type === 'list' && <List className="h-4 w-4 text-primary" />}
                      {prompt.type === 'follow' && <Users className="h-4 w-4 text-primary" />}
                      {prompt.type === 'favorite' && <Heart className="h-4 w-4 text-primary" />}
                      {prompt.title}
                    </CardTitle>
                    <CardDescription className="mt-1 text-xs sm:text-sm">
                      {prompt.description}
                    </CardDescription>
                  </div>
                  {prompt.priority === 'high' && (
                    <Badge variant="default" className="ml-2 text-xs">New</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Button asChild size="sm" className="w-full" data-testid={`button-${prompt.type}-action`}>
                  <Link href={prompt.action.url}>
                    {prompt.action.label}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Main Content */}
      <Tabs defaultValue="feed" className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <TabsList className={`w-full sm:w-auto grid ${user ? 'grid-cols-7' : 'grid-cols-6'} sm:flex`} data-testid="tabs-community">
            <TabsTrigger value="feed" data-testid="tab-activity-feed">
              <Clock className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Activity Feed</span>
              <span className="sm:hidden">Feed</span>
            </TabsTrigger>
            <TabsTrigger value="reviews" data-testid="tab-top-reviews">
              <Star className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Top Reviews</span>
              <span className="sm:hidden">Reviews</span>
            </TabsTrigger>
            <TabsTrigger value="trending" data-testid="tab-trending">
              <TrendingUp className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Trending</span>
              <span className="sm:hidden">Trend</span>
            </TabsTrigger>
            <TabsTrigger value="foryou" data-testid="tab-for-you">
              <Heart className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">For You</span>
              <span className="sm:hidden">For You</span>
            </TabsTrigger>
            <TabsTrigger value="search" data-testid="tab-search">
              <Search className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Search</span>
              <span className="sm:hidden">Search</span>
            </TabsTrigger>
            <TabsTrigger value="leaderboards" data-testid="tab-leaderboards">
              <Trophy className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Leaderboards</span>
              <span className="sm:hidden">Leaders</span>
            </TabsTrigger>
          </TabsList>

          <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
            <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-time-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily" data-testid="filter-daily">Last 24 Hours</SelectItem>
              <SelectItem value="weekly" data-testid="filter-weekly">This Week</SelectItem>
              <SelectItem value="monthly" data-testid="filter-monthly">This Month</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Activity Feed Tab */}
        <TabsContent value="feed" className="space-y-4">
          {feedLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : feedData?.pages?.[0]?.data && feedData.pages.some(page => page.data.length > 0) ? (
            <div className="space-y-4">
              {feedData.pages.flatMap(page => page.data).map((item: FeedItem) => (
                <Card key={`${item.type}-${item.id}`} className="hover:shadow-md transition-shadow" data-testid={`feed-item-${item.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Link href={`/profile/${userIdToUsername(item.userId)}`}>
                          <Avatar className="h-10 w-10 cursor-pointer" data-testid={`avatar-${item.userId}`}>
                            <AvatarImage src={item.user.profileImageUrl ?? undefined} />
                            <AvatarFallback>{item.user.firstName?.[0] || 'U'}</AvatarFallback>
                          </Avatar>
                        </Link>
                        <div>
                          <div className="flex items-center gap-2">
                            <Link href={`/profile/${item.userId}`} className="font-semibold hover:underline" data-testid={`link-user-${item.userId}`}>
                              {item.user.firstName} {item.user.lastName}
                            </Link>
                            {item.type === 'review' ? (
                              <Badge variant="secondary" className="text-xs">Reviewed</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">Created List</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground dark:text-muted-foreground">
                            {item.createdAt && formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {item.type === 'review' ? (
                      <div className="flex gap-4">
                        {item.posterPath && (
                          <img
                            src={`https://image.tmdb.org/t/p/w154${item.posterPath}`}
                            alt={item.title}
                            className="w-20 h-30 object-cover rounded"
                          />
                        )}
                        <div className="flex-1">
                          <Link href={`/${item.mediaType}/${item.tmdbId}`} className="font-semibold text-lg hover:underline" data-testid={`link-media-${item.tmdbId}`}>
                            {item.title}
                          </Link>
                          {item.rating && (
                            <div className="flex items-center gap-1 mt-1">
                              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                              <span className="font-medium">{item.rating}/10</span>
                            </div>
                          )}
                          <p className="text-muted-foreground dark:text-muted-foreground mt-2 line-clamp-3">
                            {item.review}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <Link href={`/lists/${item.id}`} className="font-semibold text-lg hover:underline block mb-2" data-testid={`link-list-${item.id}`}>
                          <List className="h-4 w-4 inline mr-2" />
                          {item.title}
                        </Link>
                        {item.description && (
                          <p className="text-muted-foreground dark:text-muted-foreground line-clamp-2 mb-2">
                            {item.description}
                          </p>
                        )}
                        <div className="flex gap-4 text-sm text-muted-foreground dark:text-muted-foreground">
                          <span>{item.itemCount || 0} items</span>
                          <span>{item.followerCount || 0} followers</span>
                        </div>
                      </div>
                    )}
                    
                    {/* Social Context */}
                    {(item as any).socialContext?.followedUsersEngaged?.length > 0 && (
                      <div className="mt-3 pt-3 border-t flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground dark:text-muted-foreground">
                          <span className="font-medium text-foreground">
                            {(item as any).socialContext.followedUsersEngaged[0].firstName}
                          </span>
                          {(item as any).socialContext.followedUsersEngaged.length > 1 && (
                            <> and {(item as any).socialContext.followedUsersEngaged.length - 1} other{(item as any).socialContext.followedUsersEngaged.length > 2 ? 's' : ''}</>
                          )}
                          {' '}{(item as any).socialContext.followedUsersEngaged[0].action}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              
              {hasNextFeedPage && (
                <div className="flex justify-center pt-4">
                  <Button
                    onClick={() => fetchNextFeedPage()}
                    variant="outline"
                    disabled={isFetchingNextFeedPage}
                    data-testid="button-load-more-feed"
                  >
                    {isFetchingNextFeedPage ? 'Loading...' : 'Load More'}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground dark:text-muted-foreground mb-4" />
                <p className="text-muted-foreground dark:text-muted-foreground">No recent activity</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Top Reviews Tab */}
        <TabsContent value="reviews" className="space-y-4">
          <div className="flex justify-end mb-4">
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <SelectTrigger className="w-[180px]" data-testid="select-sort-by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="awards" data-testid="sort-awards">Most Awards</SelectItem>
                <SelectItem value="comments" data-testid="sort-comments">Most Comments</SelectItem>
                <SelectItem value="helpful" data-testid="sort-helpful">Most Helpful</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {topReviewsLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : topReviewsData?.pages?.[0]?.data && topReviewsData.pages.some(page => page.data.length > 0) ? (
            <div className="space-y-4">
              {topReviewsData.pages.flatMap(page => page.data).map((review: TopReview) => (
                <ReviewCardEnhanced
                  key={review.id}
                  review={{...review, user: review.user ? {...review.user, profileImageUrl: review.user.profileImageUrl ?? undefined} : undefined}}
                  currentUserId={user?.id}
                />
              ))}
              
              {hasNextReviewsPage && (
                <div className="flex justify-center pt-4">
                  <Button
                    onClick={() => fetchNextReviewsPage()}
                    variant="outline"
                    disabled={isFetchingNextReviewsPage}
                    data-testid="button-load-more-reviews"
                  >
                    {isFetchingNextReviewsPage ? 'Loading...' : 'Load More Reviews'}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="max-w-md mx-auto">
                  <Star className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-muted-foreground/50 dark:text-muted-foreground/50 mb-4 sm:mb-6 animate-pulse" />
                  <h3 className="text-lg sm:text-xl font-semibold mb-2">No reviews yet for this period</h3>
                  <p className="text-sm sm:text-base text-muted-foreground dark:text-muted-foreground mb-4 sm:mb-6 px-4 sm:px-0">
                    Be the first to write a review and earn awards from the community!
                  </p>
                  <Button className="inline-flex items-center gap-2" asChild>
                    <Link href="/movies">
                      <MessageSquare className="h-4 w-4" />
                      Start Reviewing
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Trending Tab */}
        <TabsContent value="trending" className="space-y-4">
          {trendingLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="aspect-[2/3] w-full" />
              ))}
            </div>
          ) : trendingData?.pages?.[0]?.data && trendingData.pages.some(page => page.data.length > 0) ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {trendingData.pages.flatMap(page => page.data).map((item: TrendingContent) => (
                <Link
                  key={`${item.tmdbId}-${item.mediaType}`}
                  href={`/${item.mediaType}/${item.tmdbId}`}
                  className="group"
                  data-testid={`trending-item-${item.tmdbId}`}
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-lg">
                    {item.posterPath ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w342${item.posterPath}`}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center">
                        <TrendingUp className="h-12 w-12 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-sm">
                      <Star className="h-3 w-3 inline mr-1" />
                      {item.avgRating ? Number(item.avgRating).toFixed(1) : 'N/A'}
                    </div>
                  </div>
                  <h3 className="font-medium mt-2 line-clamp-2 text-sm">{item.title}</h3>
                  <p className="text-xs text-muted-foreground dark:text-muted-foreground">
                    {item.ratingCount} {item.ratingCount === 1 ? 'rating' : 'ratings'}
                  </p>
                </Link>
              ))}
              </div>
              
              {hasNextTrendingPage && (
                <div className="flex justify-center pt-4">
                  <Button
                    onClick={() => fetchNextTrendingPage()}
                    variant="outline"
                    disabled={isFetchingNextTrendingPage}
                    data-testid="button-load-more-trending"
                  >
                    {isFetchingNextTrendingPage ? 'Loading...' : 'Load More Trending'}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="max-w-md mx-auto">
                  <TrendingUp className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-muted-foreground/50 dark:text-muted-foreground/50 mb-4 sm:mb-6 animate-pulse" />
                  <h3 className="text-lg sm:text-xl font-semibold mb-2">No trending content for this period</h3>
                  <p className="text-sm sm:text-base text-muted-foreground dark:text-muted-foreground mb-4 sm:mb-6 px-4 sm:px-0">
                    Rate and review movies and TV shows to see what's trending in the community!
                  </p>
                  <Button className="inline-flex items-center gap-2" asChild>
                    <Link href="/movies">
                      <TrendingUp className="h-4 w-4" />
                      Discover Movies
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Leaderboards Tab */}
        <TabsContent value="leaderboards" className="space-y-6">
          {leaderboardsLoading ? (
            <div className="grid md:grid-cols-2 gap-6">
              {[...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-32 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : leaderboards ? (
            <div className="grid md:grid-cols-2 gap-6">
              {/* Top Reviewers */}
              <Card data-testid="card-top-reviewers">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-yellow-500" />
                    Top Reviewers
                  </CardTitle>
                  <CardDescription>Most reviews written</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {leaderboards && (leaderboards as LeaderboardsResponse).topReviewers?.map((user, index: number) => {
                      const levelInfo = getLevelBadge(user.userLevel || 0);
                      return (
                        <Link
                          key={user.userId}
                          href={`/profile/${userIdToUsername(user.userId)}`}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
                          data-testid={`top-reviewer-${index}`}
                        >
                          <span className="text-2xl font-bold text-muted-foreground dark:text-muted-foreground w-8">
                            {index + 1}
                          </span>
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={user.user.profileImageUrl ?? undefined} />
                            <AvatarFallback>{user.user.firstName?.[0] || 'U'}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {user.user.firstName} {user.user.lastName}
                            </p>
                            <div className="flex items-center gap-2">
                              <Badge className={levelInfo.color}>{levelInfo.name}</Badge>
                              <span className="text-sm text-muted-foreground dark:text-muted-foreground">
                                {user.totalReviews} reviews
                              </span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Top List Creators */}
              <Card data-testid="card-top-list-creators">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <List className="h-5 w-5 text-purple-500" />
                    Top List Creators
                  </CardTitle>
                  <CardDescription>Most lists created</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {leaderboards && (leaderboards as LeaderboardsResponse).topListCreators?.map((user, index: number) => {
                      const levelInfo = getLevelBadge(user.userLevel || 0);
                      return (
                        <Link
                          key={user.userId}
                          href={`/profile/${userIdToUsername(user.userId)}`}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
                          data-testid={`top-list-creator-${index}`}
                        >
                          <span className="text-2xl font-bold text-muted-foreground dark:text-muted-foreground w-8">
                            {index + 1}
                          </span>
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={user.user.profileImageUrl ?? undefined} />
                            <AvatarFallback>{user.user.firstName?.[0] || 'U'}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {user.user.firstName} {user.user.lastName}
                            </p>
                            <div className="flex items-center gap-2">
                              <Badge className={levelInfo.color}>{levelInfo.name}</Badge>
                              <span className="text-sm text-muted-foreground dark:text-muted-foreground">
                                {user.totalLists} lists
                              </span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Most Followed */}
              <Card data-testid="card-most-followed">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-500" />
                    Most Followed
                  </CardTitle>
                  <CardDescription>Users with the most followers</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {leaderboards && (leaderboards as LeaderboardsResponse).mostFollowed?.map((user, index: number) => {
                      const levelInfo = getLevelBadge(user.userLevel || 0);
                      return (
                        <Link
                          key={user.userId}
                          href={`/profile/${userIdToUsername(user.userId)}`}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
                          data-testid={`most-followed-${index}`}
                        >
                          <span className="text-2xl font-bold text-muted-foreground dark:text-muted-foreground w-8">
                            {index + 1}
                          </span>
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={user.user.profileImageUrl ?? undefined} />
                            <AvatarFallback>{user.user.firstName?.[0] || 'U'}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {user.user.firstName} {user.user.lastName}
                            </p>
                            <div className="flex items-center gap-2">
                              <Badge className={levelInfo.color}>{levelInfo.name}</Badge>
                              <span className="text-sm text-muted-foreground dark:text-muted-foreground">
                                {user.totalFollowers} followers
                              </span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Most Awarded */}
              <Card data-testid="card-most-awarded">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-orange-500" />
                    Most Awarded
                  </CardTitle>
                  <CardDescription>Users with the most awards</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {leaderboards && (leaderboards as LeaderboardsResponse).mostAwarded?.map((user, index: number) => {
                      const levelInfo = getLevelBadge(user.userLevel || 0);
                      return (
                        <Link
                          key={user.userId}
                          href={`/profile/${userIdToUsername(user.userId)}`}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
                          data-testid={`most-awarded-${index}`}
                        >
                          <span className="text-2xl font-bold text-muted-foreground dark:text-muted-foreground w-8">
                            {index + 1}
                          </span>
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={user.user.profileImageUrl ?? undefined} />
                            <AvatarFallback>{user.user.firstName?.[0] || 'U'}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {user.user.firstName} {user.user.lastName}
                            </p>
                            <div className="flex items-center gap-2">
                              <Badge className={levelInfo.color}>{levelInfo.name}</Badge>
                              <span className="text-sm text-muted-foreground dark:text-muted-foreground">
                                {user.totalAwardsReceived} awards
                              </span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </TabsContent>

        {/* For You Tab */}
        <TabsContent value="foryou" className="space-y-6">
          {!user ? (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="max-w-md mx-auto">
                  <Heart className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-muted-foreground/50 dark:text-muted-foreground/50 mb-4 sm:mb-6" />
                  <h3 className="text-lg sm:text-xl font-semibold mb-2">Sign in to see personalized recommendations</h3>
                  <p className="text-sm sm:text-base text-muted-foreground dark:text-muted-foreground px-4 sm:px-0">
                    We'll suggest lists based on your ratings and favorites
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Personalized Feed from Followed Users */}
              <div>
                <div className="mb-4">
                  <h2 className="text-xl font-semibold">Activity from People You Follow</h2>
                  <p className="text-sm text-muted-foreground dark:text-muted-foreground">
                    Latest reviews and lists from your network
                  </p>
                </div>
                {personalizedFeedLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                      <Card key={i}>
                        <CardHeader>
                          <Skeleton className="h-6 w-3/4" />
                        </CardHeader>
                        <CardContent>
                          <Skeleton className="h-20 w-full" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : personalizedFeedData?.pages?.[0]?.data && personalizedFeedData.pages.some(page => page.data.length > 0) ? (
                  <div className="space-y-4">
                    {personalizedFeedData.pages.flatMap(page => page.data).map((item: FeedItem) => (
                      <Card key={`${item.type}-${item.id}`} className="hover:shadow-md transition-shadow">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <Link href={`/profile/${userIdToUsername(item.userId)}`}>
                                <Avatar className="h-10 w-10 cursor-pointer">
                                  <AvatarImage src={item.user.profileImageUrl ?? undefined} />
                                  <AvatarFallback>{item.user.firstName?.[0] || 'U'}</AvatarFallback>
                                </Avatar>
                              </Link>
                              <div>
                                <div className="flex items-center gap-2">
                                  <Link href={`/profile/${item.userId}`} className="font-semibold hover:underline">
                                    {item.user.firstName} {item.user.lastName}
                                  </Link>
                                  {item.type === 'review' ? (
                                    <Badge variant="secondary" className="text-xs">Reviewed</Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-xs">Created List</Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground dark:text-muted-foreground">
                                  {item.createdAt && formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                                </p>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {item.type === 'review' ? (
                            <div className="flex gap-4">
                              {item.posterPath && (
                                <img
                                  src={`https://image.tmdb.org/t/p/w154${item.posterPath}`}
                                  alt={item.title}
                                  className="w-20 h-30 object-cover rounded"
                                />
                              )}
                              <div className="flex-1">
                                <Link href={`/${item.mediaType}/${item.tmdbId}`} className="font-semibold text-lg hover:underline">
                                  {item.title}
                                </Link>
                                {item.rating && (
                                  <div className="flex items-center gap-1 mt-1">
                                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                    <span className="font-medium">{item.rating}/10</span>
                                  </div>
                                )}
                                <p className="text-muted-foreground dark:text-muted-foreground mt-2 line-clamp-3">
                                  {item.review}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <Link href={`/lists/${item.id}`} className="font-semibold text-lg hover:underline block mb-2">
                                <List className="h-4 w-4 inline mr-2" />
                                {item.title}
                              </Link>
                              {item.description && (
                                <p className="text-muted-foreground dark:text-muted-foreground line-clamp-2 mb-2">
                                  {item.description}
                                </p>
                              )}
                              <div className="flex gap-4 text-sm text-muted-foreground dark:text-muted-foreground">
                                <span>{item.itemCount || 0} items</span>
                                <span>{item.followerCount || 0} followers</span>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                    
                    {hasNextPersonalizedPage && (
                      <div className="flex justify-center pt-4">
                        <Button
                          onClick={() => fetchNextPersonalizedPage()}
                          variant="outline"
                          disabled={isFetchingNextPersonalizedPage}
                          data-testid="button-load-more-personalized"
                        >
                          {isFetchingNextPersonalizedPage ? 'Loading...' : 'Load More'}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Users className="h-12 w-12 mx-auto text-muted-foreground/50 dark:text-muted-foreground/50 mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No activity yet</h3>
                      <p className="text-sm text-muted-foreground dark:text-muted-foreground mb-4">
                        Follow users to see their reviews and lists here
                      </p>
                      <Button asChild>
                        <Link href="/community">
                          <Users className="h-4 w-4 mr-2" />
                          Discover Users
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Recommended Lists */}
              {recommendedListsLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-24 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : recommendedLists && Array.isArray(recommendedLists) && recommendedLists.length > 0 ? (
            <div>
              <div className="mb-4">
                <h2 className="text-xl font-semibold">Recommended Lists for You</h2>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground">
                  Based on your ratings and favorites
                </p>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {recommendedLists.map((list: RecommendedList) => (
                  <Link key={list.id} href={`/lists/${list.id}`}>
                    <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer" data-testid={`recommended-list-${list.id}`}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-lg line-clamp-1 flex-1">{list.title}</CardTitle>
                          <Badge variant="secondary" className="ml-2">
                            {list.matchPercentage}% match
                          </Badge>
                        </div>
                        <CardDescription className="line-clamp-2">
                          {list.description || 'No description'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground dark:text-muted-foreground mb-3">
                          <div className="flex items-center gap-1">
                            <List className="h-4 w-4" />
                            <span>{list.itemCount} items</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            <span>{list.followerCount} followers</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={list.user?.profileImageUrl ?? undefined} />
                            <AvatarFallback>{list.user?.firstName?.[0] || 'U'}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm text-muted-foreground dark:text-muted-foreground">
                            {list.user?.firstName} {list.user?.lastName}
                          </span>
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground dark:text-muted-foreground">
                          <Badge variant="outline" className="text-xs">
                            <Heart className="h-3 w-3 mr-1" />
                            {list.matchCount} items you loved
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="max-w-md mx-auto">
                  <Heart className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-muted-foreground/50 dark:text-muted-foreground/50 mb-4 sm:mb-6" />
                  <h3 className="text-lg sm:text-xl font-semibold mb-2">No recommendations yet</h3>
                  <p className="text-sm sm:text-base text-muted-foreground dark:text-muted-foreground px-4 sm:px-0">
                    Start rating movies and shows to get personalized list recommendations
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

              {/* Similar Users Section */}
              <div>
                <div className="mb-4">
                  <h2 className="text-xl font-semibold">Users With Similar Taste</h2>
                  <p className="text-sm text-muted-foreground dark:text-muted-foreground">
                    Connect with people who love the same movies and shows
                  </p>
                </div>
                {similarUsersLoading ? (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                      <Card key={i}>
                        <CardHeader>
                          <Skeleton className="h-6 w-3/4" />
                          <Skeleton className="h-4 w-1/2" />
                        </CardHeader>
                        <CardContent>
                          <Skeleton className="h-16 w-full" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : similarUsers && Array.isArray(similarUsers) && similarUsers.length > 0 ? (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {similarUsers.map((similarUser: SimilarUser) => {
                      const levelInfo = getLevelBadge(similarUser.stats?.experiencePoints || 0);
                      return (
                        <Link key={similarUser.id} href={`/profile/${userIdToUsername(similarUser.id)}`}>
                          <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer" data-testid={`similar-user-${similarUser.id}`}>
                            <CardHeader>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-12 w-12">
                                  <AvatarImage src={similarUser.profileImageUrl ?? undefined} />
                                  <AvatarFallback>{similarUser.firstName?.[0] || 'U'}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1 min-w-0">
                                  <CardTitle className="text-lg truncate">
                                    {similarUser.firstName} {similarUser.lastName}
                                  </CardTitle>
                                  <div className="flex items-center gap-2">
                                    <Badge className={levelInfo.color}>{levelInfo.name}</Badge>
                                    <Badge variant="secondary">
                                      {similarUser.matchPercentage}% match
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="mb-3 text-sm text-muted-foreground dark:text-muted-foreground">
                                <div className="flex items-center gap-1">
                                  <Star className="h-4 w-4" />
                                  <span>{similarUser.commonMovies} movies/shows in common</span>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div className="text-center p-2 bg-muted rounded">
                                  <div className="font-semibold">{similarUser.stats?.totalReviews || 0}</div>
                                  <div className="text-xs text-muted-foreground dark:text-muted-foreground">Reviews</div>
                                </div>
                                <div className="text-center p-2 bg-muted rounded">
                                  <div className="font-semibold">{similarUser.stats?.totalLists || 0}</div>
                                  <div className="text-xs text-muted-foreground dark:text-muted-foreground">Lists</div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <div className="max-w-md mx-auto">
                        <Users className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-muted-foreground/50 dark:text-muted-foreground/50 mb-3 sm:mb-4" />
                        <h3 className="text-base sm:text-lg font-semibold mb-1">No similar users found yet</h3>
                        <p className="text-xs sm:text-sm text-muted-foreground dark:text-muted-foreground px-4 sm:px-0">
                          Rate more content to find users with similar taste
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </TabsContent>

        {/* Search Tab */}
        <TabsContent value="search" className="space-y-4">
          <div className="space-y-4">
            {/* Search Input */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search lists or users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
              <Select value={searchType} onValueChange={(v) => setSearchType(v as 'lists' | 'users')}>
                <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-search-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lists" data-testid="search-type-lists">Lists</SelectItem>
                  <SelectItem value="users" data-testid="search-type-users">Users</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Search Results */}
            {!searchQuery.trim() ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <div className="max-w-md mx-auto">
                    <Search className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-muted-foreground/50 dark:text-muted-foreground/50 mb-4 sm:mb-6" />
                    <h3 className="text-lg sm:text-xl font-semibold mb-2">Search for Lists or Users</h3>
                    <p className="text-sm sm:text-base text-muted-foreground dark:text-muted-foreground px-4 sm:px-0">
                      Enter a search term above to find community lists or users
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : searchType === 'lists' ? (
              // Lists Search Results
              searchListsLoading ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <Card key={i}>
                      <CardHeader>
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-24 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : searchListsResults && Array.isArray(searchListsResults) && searchListsResults.length > 0 ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {searchListsResults.map((list: SearchListResult) => (
                    <Link key={list.id} href={`/lists/${list.id}`}>
                      <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer" data-testid={`search-list-${list.id}`}>
                        <CardHeader>
                          <CardTitle className="text-lg line-clamp-1">{list.title}</CardTitle>
                          <CardDescription className="line-clamp-2">{list.description || 'No description'}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground dark:text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <List className="h-4 w-4" />
                              <span>{list.itemCount} items</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              <span>{list.followerCount} followers</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-3">
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={list.user?.profileImageUrl ?? undefined} />
                              <AvatarFallback>{list.user?.firstName?.[0] || 'U'}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm text-muted-foreground dark:text-muted-foreground">
                              {list.user?.firstName} {list.user?.lastName}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-16 text-center">
                    <div className="max-w-md mx-auto">
                      <List className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-muted-foreground/50 dark:text-muted-foreground/50 mb-4 sm:mb-6" />
                      <h3 className="text-lg sm:text-xl font-semibold mb-2">No lists found</h3>
                      <p className="text-sm sm:text-base text-muted-foreground dark:text-muted-foreground px-4 sm:px-0">
                        Try searching with different keywords
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )
            ) : (
              // Users Search Results
              searchUsersLoading ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <Card key={i}>
                      <CardHeader>
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-16 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : searchUsersResults && Array.isArray(searchUsersResults) && searchUsersResults.length > 0 ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {searchUsersResults.map((foundUser: SearchUserResult) => {
                    const levelInfo = getLevelBadge(foundUser.stats?.experiencePoints || 0);
                    return (
                      <Link key={foundUser.id} href={`/profile/${userIdToUsername(foundUser.id)}`}>
                        <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer" data-testid={`search-user-${foundUser.id}`}>
                          <CardHeader>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-12 w-12">
                                <AvatarImage src={foundUser.profileImageUrl ?? undefined} />
                                <AvatarFallback>{foundUser.firstName?.[0] || 'U'}</AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <CardTitle className="text-lg truncate">
                                  {foundUser.firstName} {foundUser.lastName}
                                </CardTitle>
                                <Badge className={levelInfo.color}>{levelInfo.name}</Badge>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="text-center p-2 bg-muted rounded">
                                <div className="font-semibold">{foundUser.stats?.totalReviews || 0}</div>
                                <div className="text-xs text-muted-foreground dark:text-muted-foreground">Reviews</div>
                              </div>
                              <div className="text-center p-2 bg-muted rounded">
                                <div className="font-semibold">{foundUser.stats?.totalLists || 0}</div>
                                <div className="text-xs text-muted-foreground dark:text-muted-foreground">Lists</div>
                              </div>
                              <div className="text-center p-2 bg-muted rounded">
                                <div className="font-semibold">{foundUser.stats?.totalFollowers || 0}</div>
                                <div className="text-xs text-muted-foreground dark:text-muted-foreground">Followers</div>
                              </div>
                              <div className="text-center p-2 bg-muted rounded">
                                <div className="font-semibold">{foundUser.stats?.totalFollowing || 0}</div>
                                <div className="text-xs text-muted-foreground dark:text-muted-foreground">Following</div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-16 text-center">
                    <div className="max-w-md mx-auto">
                      <Users className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-muted-foreground/50 dark:text-muted-foreground/50 mb-4 sm:mb-6" />
                      <h3 className="text-lg sm:text-xl font-semibold mb-2">No users found</h3>
                      <p className="text-sm sm:text-base text-muted-foreground dark:text-muted-foreground px-4 sm:px-0">
                        Try searching with different keywords
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
