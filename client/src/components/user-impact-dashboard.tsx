import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Star, 
  List, 
  Users, 
  Award, 
  MessageSquare, 
  Heart, 
  TrendingUp, 
  Trophy,
  Sparkles,
  Target,
  Film
} from "lucide-react";
import type { UserImpactData } from "@shared/api-types";
import { getLevelBadge } from "@shared/helpers";

interface UserImpactDashboardProps {
  userId: string;
}

export function UserImpactDashboard({ userId }: UserImpactDashboardProps) {
  const { data: impactData, isLoading, error } = useQuery<UserImpactData>({
    queryKey: [`/api/community/user-impact/${userId}`],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: userStats, isLoading: statsLoading } = useQuery<any>({
    queryKey: ['/api/community', userId, 'stats'],
  });

  if (isLoading || statsLoading) {
    return (
      <div className="space-y-6" data-testid="impact-dashboard-loading">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
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
      </div>
    );
  }

  if (error || !impactData) {
    return (
      <div className="text-center py-12" data-testid="impact-dashboard-error">
        <p className="text-muted-foreground">Failed to load impact data</p>
      </div>
    );
  }

  const { reviewStats, listStats, socialStats, engagementReceived, communityRank } = impactData;
  const experiencePoints = userStats?.experiencePoints || 0;
  const levelInfo = getLevelBadge(experiencePoints);

  // Get rank color and gradient
  const getRankColor = (rank: string) => {
    switch (rank) {
      case "Legend":
        return "from-purple-500 to-pink-500";
      case "Expert":
        return "from-blue-500 to-cyan-500";
      case "Active Member":
        return "from-green-500 to-emerald-500";
      case "Contributor":
        return "from-yellow-500 to-orange-500";
      default:
        return "from-gray-500 to-slate-500";
    }
  };

  const getRankBadgeVariant = (rank: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (rank) {
      case "Legend":
        return "default";
      case "Expert":
        return "default";
      case "Active Member":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getMotivationalMessage = (rank: string) => {
    switch (rank) {
      case "Legend":
        return "You're a legend! Keep inspiring the community! 🌟";
      case "Expert":
        return "Amazing work! You're making a huge impact! 🚀";
      case "Active Member":
        return "You're doing great! Keep up the momentum! 💪";
      case "Contributor":
        return "Nice progress! Keep contributing to grow! 📈";
      default:
        return "Welcome! Start reviewing and listing to level up! 🎬";
    }
  };

  return (
    <div className="space-y-6" data-testid="impact-dashboard">
      {/* Header Section with Rank */}
      <Card className={`border-0 bg-gradient-to-r ${getRankColor(communityRank.rank)} text-white`} data-testid="rank-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <CardTitle className="text-3xl font-bold flex items-center gap-2" data-testid="rank-title">
                <Trophy className="h-8 w-8" />
                {communityRank.rank}
              </CardTitle>
              <CardDescription className="text-white/90 text-lg" data-testid="motivational-message">
                {getMotivationalMessage(communityRank.rank)}
              </CardDescription>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold" data-testid="engagement-score">
                {communityRank.engagementScore}
              </div>
              <div className="text-sm text-white/80">Engagement Score</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span data-testid="progress-label">
                {communityRank.rank === "Legend" 
                  ? "Max Rank Achieved!" 
                  : `Progress to ${communityRank.rank === "Newcomer" ? "Contributor" : communityRank.rank === "Contributor" ? "Active Member" : communityRank.rank === "Active Member" ? "Expert" : "Legend"}`
                }
              </span>
              <span className="font-semibold" data-testid="progress-percentage">
                {communityRank.progressToNextRank}%
              </span>
            </div>
            <Progress 
              value={communityRank.progressToNextRank} 
              className="h-3 bg-white/30" 
              data-testid="progress-bar"
            />
            {communityRank.rank !== "Legend" && (
              <p className="text-xs text-white/70" data-testid="next-rank-score">
                {communityRank.nextRankScore - communityRank.engagementScore} points to next rank
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Review Stats Card */}
        <Card data-testid="card-review-stats">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Review Activity</CardTitle>
            <Star className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <div className="text-2xl font-bold" data-testid="total-reviews">
                  {reviewStats.totalReviews}
                </div>
                <p className="text-xs text-muted-foreground">Total Reviews</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="font-semibold" data-testid="average-rating">
                    {reviewStats.averageRatingGiven > 0 ? reviewStats.averageRatingGiven.toFixed(1) : "0"}
                  </div>
                  <p className="text-xs text-muted-foreground">Avg Rating</p>
                </div>
                <div>
                  <div className="font-semibold capitalize" data-testid="most-active-genre">
                    {reviewStats.mostActiveGenre || "N/A"}
                  </div>
                  <p className="text-xs text-muted-foreground">Most Active</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* List Stats Card */}
        <Card data-testid="card-list-stats">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">List Creation</CardTitle>
            <List className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <div className="text-2xl font-bold" data-testid="total-lists">
                  {listStats.totalLists}
                </div>
                <p className="text-xs text-muted-foreground">Lists Created</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="font-semibold" data-testid="total-list-followers">
                    {listStats.totalListFollowers}
                  </div>
                  <p className="text-xs text-muted-foreground">Followers</p>
                </div>
                <div>
                  <div className="font-semibold" data-testid="total-items-in-lists">
                    {listStats.totalItemsInLists}
                  </div>
                  <p className="text-xs text-muted-foreground">Items</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Social Stats Card */}
        <Card data-testid="card-social-stats">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Social Network</CardTitle>
            <Users className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div>
                <div className="text-2xl font-bold" data-testid="follower-count">
                  {socialStats.followerCount}
                </div>
                <p className="text-xs text-muted-foreground">Followers</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="font-semibold" data-testid="following-count">
                    {socialStats.followingCount}
                  </div>
                  <p className="text-xs text-muted-foreground">Following</p>
                </div>
                <div>
                  <div className="font-semibold" data-testid="profile-views">
                    {socialStats.profileViews}
                  </div>
                  <p className="text-xs text-muted-foreground">Profile Views</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Awards Received Card */}
        <Card data-testid="card-awards-received">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Awards Earned</CardTitle>
            <Award className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="total-awards-received">
              {engagementReceived.totalAwardsReceived}
            </div>
            <p className="text-xs text-muted-foreground">
              Reviews recognized by the community
            </p>
          </CardContent>
        </Card>

        {/* Comments Received Card */}
        <Card data-testid="card-comments-received">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comments Received</CardTitle>
            <MessageSquare className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="total-comments-received">
              {engagementReceived.totalCommentsReceived}
            </div>
            <p className="text-xs text-muted-foreground">
              Conversations sparked
            </p>
          </CardContent>
        </Card>

        {/* Review Likes Card */}
        <Card data-testid="card-review-likes">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Helpful Reviews</CardTitle>
            <Heart className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="total-review-likes">
              {engagementReceived.totalReviewLikes}
            </div>
            <p className="text-xs text-muted-foreground">
              People found your reviews helpful
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Impact Summary */}
      <Card className="border-primary/50" data-testid="impact-summary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Your Impact Summary
          </CardTitle>
          <CardDescription>Keep contributing to grow your influence in the community!</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <Target className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold mb-1">Engagement Score Breakdown</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div className="flex justify-between" data-testid="score-reviews">
                    <span>Reviews ({reviewStats.totalReviews} × 2)</span>
                    <span className="font-medium">{reviewStats.totalReviews * 2} points</span>
                  </div>
                  <div className="flex justify-between" data-testid="score-lists">
                    <span>Lists ({listStats.totalLists} × 5)</span>
                    <span className="font-medium">{listStats.totalLists * 5} points</span>
                  </div>
                  <div className="flex justify-between" data-testid="score-awards">
                    <span>Awards ({engagementReceived.totalAwardsReceived} × 1)</span>
                    <span className="font-medium">{engagementReceived.totalAwardsReceived} points</span>
                  </div>
                  <div className="flex justify-between" data-testid="score-followers">
                    <span>Followers ({socialStats.followerCount} × 3)</span>
                    <span className="font-medium">{socialStats.followerCount * 3} points</span>
                  </div>
                </div>
              </div>
            </div>
            
            {communityRank.rank !== "Legend" && (
              <div className="flex items-start gap-4 pt-4 border-t">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <TrendingUp className="h-6 w-6 text-green-500" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold mb-1">How to Level Up</h4>
                  <p className="text-sm text-muted-foreground">
                    {communityRank.rank === "Newcomer" && "Write reviews, create lists, and engage with others to reach Contributor status!"}
                    {communityRank.rank === "Contributor" && "Keep reviewing and building your follower base to become an Active Member!"}
                    {communityRank.rank === "Active Member" && "Continue your great work to achieve Expert status!"}
                    {communityRank.rank === "Expert" && "You're almost there! Keep going to become a Legend!"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
