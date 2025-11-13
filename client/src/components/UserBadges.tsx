import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Award, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { UserBadge } from "@shared/schema";

interface BadgeProgress {
  badgeType: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
  currentValue: number;
  requiredValue: number;
  progressPercentage: number;
}

interface UserBadgesProps {
  userId: string;
}

export function UserBadges({ userId }: UserBadgesProps) {
  const { data: badgeProgress = [], isLoading } = useQuery<BadgeProgress[]>({
    queryKey: ['/api/community/users', userId, 'badge-progress'],
    enabled: !!userId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Award className="h-5 w-5" />
            <span>Badges & Achievements</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col items-center space-y-2">
                <Skeleton className="h-16 w-16 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const earnedBadges = badgeProgress.filter(b => b.earned);
  const lockedBadges = badgeProgress.filter(b => !b.earned);

  if (badgeProgress.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Award className="h-5 w-5" />
            <span>Badges & Achievements</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground" data-testid="text-no-badges">
            <Award className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p>No badges available</p>
            <p className="text-sm mt-2">Start reviewing and interacting to earn badges!</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Award className="h-5 w-5" />
            <span data-testid="text-badges-heading">Badges & Achievements</span>
          </div>
          <Badge variant="secondary" data-testid="badge-count">
            {earnedBadges.length} / {badgeProgress.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Earned Badges */}
        {earnedBadges.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Earned Badges</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {earnedBadges.map((badge) => (
                <div
                  key={badge.badgeType}
                  className="flex flex-col items-center text-center space-y-2 p-4 rounded-lg bg-gradient-to-br from-purple-500/5 to-pink-500/5 dark:from-purple-900/10 dark:to-pink-900/10 border border-purple-500/20 hover:border-purple-500/40 transition-colors"
                  data-testid={`badge-earned-${badge.badgeType}`}
                >
                  <div className="relative">
                    <div className="text-4xl" data-testid={`icon-badge-${badge.badgeType}`}>
                      {badge.icon}
                    </div>
                  </div>
                  <div>
                    <p className="font-medium text-sm" data-testid={`text-badge-name-${badge.badgeType}`}>
                      {badge.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1" data-testid={`text-badge-description-${badge.badgeType}`}>
                      {badge.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Locked Badges with Progress */}
        {lockedBadges.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-3 text-muted-foreground">Locked Badges</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {lockedBadges.map((badge) => (
                <div
                  key={badge.badgeType}
                  className="flex flex-col items-center text-center space-y-2 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors opacity-60"
                  data-testid={`badge-locked-${badge.badgeType}`}
                >
                  <div className="relative">
                    <div className="text-4xl grayscale" data-testid={`icon-locked-${badge.badgeType}`}>
                      {badge.icon}
                    </div>
                    <Lock className="h-4 w-4 absolute -top-1 -right-1 text-muted-foreground" />
                  </div>
                  <div className="w-full">
                    <p className="font-medium text-sm" data-testid={`text-locked-name-${badge.badgeType}`}>
                      {badge.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1" data-testid={`text-locked-description-${badge.badgeType}`}>
                      {badge.description}
                    </p>
                    <div className="mt-2 space-y-1">
                      <Progress 
                        value={badge.progressPercentage} 
                        className="h-1.5" 
                        data-testid={`progress-${badge.badgeType}`}
                      />
                      <p className="text-xs text-muted-foreground" data-testid={`text-progress-${badge.badgeType}`}>
                        {badge.currentValue} / {badge.requiredValue}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
