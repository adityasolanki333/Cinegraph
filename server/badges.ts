import { db } from "./db";
import { userBadges, userActivityStats, notifications } from "@shared/schema";
import { eq, and } from "drizzle-orm";

// Badge definitions with criteria
export const BADGE_DEFINITIONS = {
  first_review: {
    name: "First Steps",
    description: "Wrote your first review",
    icon: "⭐",
    criteria: { totalReviews: 1 },
  },
  critic: {
    name: "Critic",
    description: "Wrote 10 reviews",
    icon: "📝",
    criteria: { totalReviews: 10 },
  },
  expert_critic: {
    name: "Expert Critic",
    description: "Wrote 50 reviews",
    icon: "✍️",
    criteria: { totalReviews: 50 },
  },
  review_master: {
    name: "Review Master",
    description: "Wrote 100 reviews",
    icon: "🎬",
    criteria: { totalReviews: 100 },
  },
  curator: {
    name: "Curator",
    description: "Created your first list",
    icon: "📋",
    criteria: { totalLists: 1 },
  },
  master_curator: {
    name: "Master Curator",
    description: "Created 5 lists",
    icon: "🗂️",
    criteria: { totalLists: 5 },
  },
  social_butterfly: {
    name: "Social Butterfly",
    description: "Gained 10 followers",
    icon: "🦋",
    criteria: { totalFollowers: 10 },
  },
  popular: {
    name: "Popular",
    description: "Gained 100 followers",
    icon: "🌟",
    criteria: { totalFollowers: 100 },
  },
  influencer: {
    name: "Influencer",
    description: "Gained 500 followers",
    icon: "💫",
    criteria: { totalFollowers: 500 },
  },
  generous: {
    name: "Generous",
    description: "Gave 25 awards to others",
    icon: "🎁",
    criteria: { totalAwardsGiven: 25 },
  },
  appreciated: {
    name: "Appreciated",
    description: "Received 10 awards on your reviews",
    icon: "🏆",
    criteria: { totalAwardsReceived: 10 },
  },
  highly_acclaimed: {
    name: "Highly Acclaimed",
    description: "Received 50 awards on your reviews",
    icon: "👑",
    criteria: { totalAwardsReceived: 50 },
  },
  conversationalist: {
    name: "Conversationalist",
    description: "Made 25 comments on reviews",
    icon: "💬",
    criteria: { totalComments: 25 },
  },
  newcomer: {
    name: "Newcomer",
    description: "Reached level 1 (Newbie)",
    icon: "🌱",
    criteria: { userLevel: 1 },
  },
  contributor: {
    name: "Contributor",
    description: "Reached level 3 (Contributor)",
    icon: "🔧",
    criteria: { userLevel: 3 },
  },
  expert: {
    name: "Expert",
    description: "Reached level 4 (Expert)",
    icon: "🎖️",
    criteria: { userLevel: 4 },
  },
  legend: {
    name: "Legend",
    description: "Reached level 5 (Legend)",
    icon: "🔥",
    criteria: { userLevel: 5 },
  },
} as const;

export type BadgeType = keyof typeof BADGE_DEFINITIONS;

/**
 * Check if user qualifies for any new badges and award them
 * @param userId - User to check badges for
 * @returns Array of newly awarded badges
 */
export async function checkAndAwardBadges(userId: string) {
  try {
    // Get user's current stats
    const [stats] = await db
      .select()
      .from(userActivityStats)
      .where(eq(userActivityStats.userId, userId));

    if (!stats) {
      return [];
    }

    // Get user's existing badges
    const existingBadges = await db
      .select()
      .from(userBadges)
      .where(eq(userBadges.userId, userId));

    const existingBadgeTypes = new Set(existingBadges.map((b: any) => b.badgeType));
    const newlyAwardedBadges = [];

    // Check each badge type
    for (const [badgeType, definition] of Object.entries(BADGE_DEFINITIONS)) {
      // Skip if user already has this badge
      if (existingBadgeTypes.has(badgeType)) {
        continue;
      }

      // Check if user meets criteria
      const meetsAllCriteria = Object.entries(definition.criteria).every(
        ([stat, value]) => {
          const userStatValue = stats[stat as keyof typeof stats];
          return typeof userStatValue === 'number' && userStatValue >= value;
        }
      );

      if (meetsAllCriteria) {
        // Award the badge
        const [newBadge] = await db
          .insert(userBadges)
          .values({
            userId,
            badgeType,
            badgeName: definition.name,
            badgeDescription: definition.description,
            badgeIcon: definition.icon,
          })
          .returning();

        // Create notification
        await db.insert(notifications).values({
          userId,
          actorId: null,
          type: "badge_earned",
          entityType: "badge",
          entityId: newBadge.id,
          message: `You earned the "${definition.name}" badge! ${definition.description}`,
          isRead: false,
        });

        newlyAwardedBadges.push(newBadge);
      }
    }

    return newlyAwardedBadges;
  } catch (error) {
    console.error("Error checking and awarding badges:", error);
    return [];
  }
}

/**
 * Get badge progress for a user (how close they are to earning each badge)
 */
export async function getBadgeProgress(userId: string) {
  try {
    // Get user's current stats
    const [stats] = await db
      .select()
      .from(userActivityStats)
      .where(eq(userActivityStats.userId, userId));

    if (!stats) {
      return [];
    }

    // Get user's existing badges
    const existingBadges = await db
      .select()
      .from(userBadges)
      .where(eq(userBadges.userId, userId));

    const existingBadgeTypes = new Set(existingBadges.map((b: any) => b.badgeType));

    // Calculate progress for each badge
    const progress = Object.entries(BADGE_DEFINITIONS).map(
      ([badgeType, definition]) => {
        const earned = existingBadgeTypes.has(badgeType);
        
        // Calculate progress percentage
        let progressPercentage = 0;
        let currentValue = 0;
        let requiredValue = 0;

        if (!earned) {
          const criteriaEntries = Object.entries(definition.criteria);
          if (criteriaEntries.length > 0) {
            const [stat, value] = criteriaEntries[0];
            const userStatValue = stats[stat as keyof typeof stats];
            currentValue = typeof userStatValue === 'number' ? userStatValue : 0;
            requiredValue = value;
            progressPercentage = Math.min(100, (currentValue / requiredValue) * 100);
          }
        }

        return {
          badgeType,
          name: definition.name,
          description: definition.description,
          icon: definition.icon,
          earned,
          currentValue: earned ? requiredValue : currentValue,
          requiredValue,
          progressPercentage: earned ? 100 : progressPercentage,
        };
      }
    );

    // Sort: earned badges first (by earned date), then by progress
    const earnedBadges = progress.filter(p => p.earned);
    const unearnedBadges = progress
      .filter(p => !p.earned)
      .sort((a, b) => b.progressPercentage - a.progressPercentage);

    return [...earnedBadges, ...unearnedBadges];
  } catch (error) {
    console.error("Error getting badge progress:", error);
    return [];
  }
}
