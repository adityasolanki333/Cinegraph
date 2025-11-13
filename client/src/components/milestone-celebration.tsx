import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, Sparkles } from "lucide-react";
import type { UserBadge } from "@shared/schema";

interface MilestoneCelebrationProps {
  badge: UserBadge | null;
  onClose: () => void;
}

export function MilestoneCelebration({ badge, onClose }: MilestoneCelebrationProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (badge) {
      setIsVisible(true);
      
      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => {
        handleClose();
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [badge]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300); // Wait for exit animation
  };

  if (!badge) return null;

  const motivationalMessages = [
    "Amazing achievement! 🎉",
    "You're on fire! 🔥",
    "Incredible milestone! ⭐",
    "Keep up the great work! 💪",
    "Outstanding progress! 🌟",
  ];

  const randomMessage = motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Confetti Effect */}
          <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
            {[...Array(30)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute"
                initial={{
                  x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
                  y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
                  opacity: 1,
                  scale: 1,
                }}
                animate={{
                  x: typeof window !== 'undefined' ? Math.random() * window.innerWidth : 0,
                  y: typeof window !== 'undefined' ? window.innerHeight + 100 : 0,
                  opacity: 0,
                  scale: Math.random() * 2,
                  rotate: Math.random() * 720,
                }}
                transition={{
                  duration: 2 + Math.random() * 2,
                  ease: "easeOut",
                }}
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: [
                      '#FFD700', '#FF6B9D', '#4ECDC4', '#95E1D3',
                      '#F38181', '#AA96DA', '#FCBAD3', '#FFFFD2'
                    ][Math.floor(Math.random() * 8)]
                  }}
                />
              </motion.div>
            ))}
          </div>

          {/* Celebration Card */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ scale: 0, opacity: 0, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0, rotate: 10 }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.4 }}
              className="pointer-events-auto"
            >
              <Card 
                className="w-full max-w-md bg-gradient-to-br from-purple-500/10 via-pink-500/10 to-orange-500/10 dark:from-purple-900/30 dark:via-pink-900/30 dark:to-orange-900/30 border-2 border-purple-500/50 dark:border-purple-500/30 shadow-2xl backdrop-blur-sm"
                data-testid="celebration-card"
              >
                <CardContent className="pt-6 pb-4 relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={handleClose}
                    data-testid="button-close-celebration"
                  >
                    <X className="h-4 w-4" />
                  </Button>

                  <div className="flex flex-col items-center text-center space-y-4">
                    {/* Badge Icon with Animation */}
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.2, 1] }}
                      transition={{ duration: 0.6, times: [0, 0.7, 1] }}
                      className="relative"
                    >
                      <div className="absolute inset-0 bg-yellow-400/20 dark:bg-yellow-500/20 rounded-full blur-xl animate-pulse" />
                      <div className="relative text-7xl" data-testid={`badge-icon-${badge.badgeType}`}>
                        {badge.badgeIcon || "🏆"}
                      </div>
                    </motion.div>

                    {/* Sparkles Icon */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                    >
                      <Sparkles className="h-6 w-6 text-yellow-500" />
                    </motion.div>

                    {/* Badge Name */}
                    <motion.h3
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400 bg-clip-text text-transparent"
                      data-testid="text-badge-name"
                    >
                      {badge.badgeName}
                    </motion.h3>

                    {/* Badge Description */}
                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="text-sm text-muted-foreground"
                      data-testid="text-badge-description"
                    >
                      {badge.badgeDescription}
                    </motion.p>

                    {/* Motivational Message */}
                    <motion.p
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6 }}
                      className="text-lg font-semibold text-purple-600 dark:text-purple-400"
                      data-testid="text-motivational-message"
                    >
                      {randomMessage}
                    </motion.p>

                    {/* Close Button */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.7 }}
                    >
                      <Button
                        onClick={handleClose}
                        className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
                        data-testid="button-celebration-continue"
                      >
                        Continue
                      </Button>
                    </motion.div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Background Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm z-40"
            onClick={handleClose}
          />
        </>
      )}
    </AnimatePresence>
  );
}
