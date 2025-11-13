import { Trophy, PartyPopper, ThumbsUp, Lightbulb } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface LevelInfo {
  min: number;
  max: number;
  name: string;
  color: string;
}

export interface AwardType {
  type: string;
  icon: LucideIcon;
  label: string;
  color: string;
  hoverColor: string;
}

export const LEVELS: LevelInfo[] = [
  { min: 0, max: 100, name: 'Newbie', color: 'bg-gradient-to-r from-gray-400 to-gray-600 shadow-sm' },
  { min: 101, max: 500, name: 'Enthusiast', color: 'bg-gradient-to-r from-blue-400 to-blue-600 shadow-md' },
  { min: 501, max: 1500, name: 'Contributor', color: 'bg-gradient-to-r from-purple-400 to-purple-600 shadow-md' },
  { min: 1501, max: 5000, name: 'Expert', color: 'bg-gradient-to-r from-orange-400 to-orange-600 shadow-lg' },
  { min: 5000, max: Infinity, name: 'Legend', color: 'bg-gradient-to-r from-red-500 to-pink-600 shadow-xl animate-pulse' }
];

export const AWARD_TYPES: AwardType[] = [
  { 
    type: 'outstanding', 
    icon: Trophy, 
    label: 'Outstanding', 
    color: 'text-yellow-500', 
    hoverColor: 'hover:bg-yellow-50 dark:hover:bg-yellow-950' 
  },
  { 
    type: 'perfect', 
    icon: PartyPopper, 
    label: 'Perfect', 
    color: 'text-purple-500', 
    hoverColor: 'hover:bg-purple-50 dark:hover:bg-purple-950' 
  },
  { 
    type: 'great', 
    icon: ThumbsUp, 
    label: 'Great', 
    color: 'text-blue-500', 
    hoverColor: 'hover:bg-blue-50 dark:hover:bg-blue-950' 
  },
  { 
    type: 'helpful', 
    icon: Lightbulb, 
    label: 'Helpful', 
    color: 'text-green-500', 
    hoverColor: 'hover:bg-green-50 dark:hover:bg-green-950' 
  }
];

export function getLevelBadge(xp: number): LevelInfo {
  return LEVELS.find(l => xp >= l.min && xp <= l.max) || LEVELS[0];
}

export function getAwardIcon(awardType: string) {
  return AWARD_TYPES.find(a => a.type === awardType) || AWARD_TYPES[0];
}

export function calculateXPToNextLevel(currentXP: number): number {
  const currentLevel = getLevelBadge(currentXP);
  if (currentLevel.max === Infinity) return 0;
  return currentLevel.max - currentXP + 1;
}

export function getLevelProgress(currentXP: number): number {
  const currentLevel = getLevelBadge(currentXP);
  if (currentLevel.max === Infinity) return 100;
  
  const levelRange = currentLevel.max - currentLevel.min;
  const currentProgress = currentXP - currentLevel.min;
  
  return Math.min(100, Math.max(0, (currentProgress / levelRange) * 100));
}

// Username conversion helpers for clean URLs
export function userIdToUsername(userId: string): string {
  // Convert user ID to a clean username for URLs
  // Example: user_gjgautam243_gmail_com -> gjgautam243
  // Example: demo_user -> demo_user
  
  if (userId.startsWith('user_')) {
    const emailPart = userId.substring(5); // Remove 'user_' prefix
    // Extract the username part before the email domain
    const username = emailPart
      .split('_gmail_com')[0]
      .split('_hotmail_com')[0]
      .split('_yahoo_com')[0]
      .split('_com')[0]
      .split('_')[0];
    return username;
  }
  
  return userId;
}

// Get display name from user object
export function getDisplayName(user: { 
  firstName?: string | null; 
  lastName?: string | null; 
  email?: string | null;
}): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  
  if (user.email) {
    const username = user.email.split('@')[0];
    return username
      .replace(/[._]/g, ' ')
      .split(' ')
      .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  return "User";
}
