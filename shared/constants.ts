import { Trophy, PartyPopper, ThumbsUp, Lightbulb } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface AwardType {
  type: string;
  icon: LucideIcon;
  label: string;
  color: string;
  hoverColor: string;
}

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

export function getAwardIcon(awardType: string): AwardType {
  return AWARD_TYPES.find(a => a.type === awardType) || AWARD_TYPES[0];
}

export const AWARD_ICONS = {
  outstanding: Trophy,
  perfect: PartyPopper,
  great: ThumbsUp,
  helpful: Lightbulb
} as const;

export type AwardTypeKeys = keyof typeof AWARD_ICONS;
