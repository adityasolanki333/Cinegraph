import type { 
  User, 
  UserRating, 
  UserList, 
  UserActivityStats,
  ReviewAward,
  ReviewComment
} from './schema';

// Feed item types with discriminator
export interface FeedReview {
  type: 'review';
  id: string;
  userId: string;
  createdAt: Date | null;
  content: string | null;
  review: string | null;
  tmdbId: number;
  mediaType: string;
  title: string;
  posterPath: string | null;
  rating: number;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
  };
}

export interface FeedList {
  type: 'list';
  id: string;
  userId: string;
  createdAt: Date | null;
  title: string;
  description: string | null;
  itemCount: number | null;
  followerCount: number | null;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
  };
}

export type FeedItem = FeedReview | FeedList;

// Top review type
export interface TopReview extends UserRating {
  user: {
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
  };
  awardsCount: number;
  commentsCount: number;
}

// Trending content type
export interface TrendingContent {
  tmdbId: number;
  mediaType: string;
  title: string;
  posterPath: string | null;
  trendingScore: number;
  views?: number;
  ratings?: number;
  ratingCount?: number;
  avgRating?: number;
}

// Leaderboard user type
export interface LeaderboardUser {
  userId: string;
  userLevel: number;
  totalReviews?: number;
  totalLists?: number;
  totalFollowers?: number;
  totalAwardsReceived?: number;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
  };
}

// Leaderboards response type
export interface LeaderboardsResponse {
  topReviewers: LeaderboardUser[];
  topListCreators: LeaderboardUser[];
  mostFollowed: LeaderboardUser[];
  mostAwarded: LeaderboardUser[];
}

// Recommended list type
export interface RecommendedList extends UserList {
  user: {
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
  };
  matchReason?: string;
  matchPercentage?: number;
  matchCount?: number;
}

// Similar user type
export interface SimilarUser {
  id: string;
  firstName: string;
  lastName: string;
  profileImageUrl: string | null;
  stats: UserActivityStats;
  matchPercentage: number;
  commonMovies: number;
  matchCount?: number;
}

// Search results types
export interface SearchListResult extends UserList {
  user: {
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
  };
}

export interface SearchUserResult {
  id: string;
  firstName: string;
  lastName: string;
  profileImageUrl: string | null;
  stats: UserActivityStats;
}

// User stats response type
export interface UserStatsResponse {
  stats: UserActivityStats;
  isFollowing: boolean;
}

// Review with details type
export interface ReviewWithDetails extends UserRating {
  user?: {
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
  };
}

// Comment with user type
export interface CommentWithUser extends ReviewComment {
  user: {
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
  };
}

// Award with user type
export interface AwardWithUser extends ReviewAward {
  user?: {
    firstName: string;
    lastName: string;
  };
}

// User Impact Dashboard data type
export interface UserImpactData {
  reviewStats: {
    totalReviews: number;
    averageRatingGiven: number;
    mostActiveGenre: string | null;
  };
  listStats: {
    totalLists: number;
    totalListFollowers: number;
    totalItemsInLists: number;
  };
  socialStats: {
    followerCount: number;
    followingCount: number;
    profileViews: number;
  };
  engagementReceived: {
    totalAwardsReceived: number;
    totalCommentsReceived: number;
    totalReviewLikes: number;
  };
  communityRank: {
    level: number;
    rank: string;
    engagementScore: number;
    nextRankScore: number;
    progressToNextRank: number;
  };
}
