import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, TrendingUp, Heart, Star, Brain, Target, CheckCircle, ThumbsUp, ThumbsDown, Clock, Activity } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface ExplanationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  tmdbId: number;
  mediaType: string;
  title: string;
  recommendationScore?: number;
  recommendationDiversity?: number;
  recommendationStrategy?: string;
  experimentId?: string;
}

interface FeatureImportance {
  featureName: string;
  importance: number;
  percentageContribution: number;
  humanReadable: string;
}

interface VisualBreakdown {
  featureName: string;
  percentage: number;
  color: string;
}

interface Explanation {
  primaryReason: string;
  contributingFactors: FeatureImportance[];
  visualBreakdown: VisualBreakdown[];
  confidenceScore: number;
  explanationText: string;
}

const getFeatureIcon = (featureName: string) => {
  if (featureName.toLowerCase().includes('genre')) return Heart;
  if (featureName.toLowerCase().includes('rating')) return Star;
  if (featureName.toLowerCase().includes('popular')) return TrendingUp;
  if (featureName.toLowerCase().includes('prefer')) return Brain;
  return Sparkles;
};

const getDiversityLevel = (diversity: number): 'high' | 'balanced' | 'focused' => {
  if (diversity >= 0.7) return 'high';
  if (diversity >= 0.4) return 'balanced';
  return 'focused';
};

const getDiversityIcon = (diversity: number) => {
  const level = getDiversityLevel(diversity);
  const className = "h-5 w-5";
  
  if (level === 'high') return <Sparkles className={className} />;
  if (level === 'balanced') return <Target className={className} />;
  return <TrendingUp className={className} />;
};

const getDiversityBorderColor = (diversity: number): string => {
  const level = getDiversityLevel(diversity);
  if (level === 'high') return 'hsl(var(--primary))';
  if (level === 'balanced') return 'hsl(142 71% 45%)';
  return 'hsl(48 96% 53%)';
};

const getDiversityDescription = (diversity: number): string => {
  const level = getDiversityLevel(diversity);
  
  if (level === 'high') {
    return 'We\'ve included a diverse mix to expand your viewing horizons and prevent filter bubbles.';
  }
  if (level === 'balanced') {
    return 'We\'ve balanced familiar favorites with new discoveries to maintain variety.';
  }
  return 'We\'ve focused on content similar to your proven tastes for a personalized experience.';
};

const getDiversityBenefits = (diversity: number): string[] => {
  const level = getDiversityLevel(diversity);
  
  if (level === 'high') {
    return [
      'Expands your horizons',
      'Prevents recommendation bubbles',
      'Introduces new genres',
    ];
  }
  if (level === 'balanced') {
    return [
      'Mixes familiar favorites with discoveries',
      'Maintains variety',
    ];
  }
  return [
    'Matches your proven tastes',
    'Deep dive into favorites',
  ];
};

const getStrategyExplanation = (strategy: string): { title: string; description: string; icon: any } => {
  const strategyMap: Record<string, { title: string; description: string; icon: any }> = {
    'tensorflow_neural': {
      title: 'Deep Learning Neural Network',
      description: 'Our AI analyzed thousands of viewing patterns and found deep connections between your preferences and this content. This approach excels at discovering hidden similarities that match your unique taste.',
      icon: Brain,
    },
    'collaborative': {
      title: 'Community-Based Matching',
      description: 'We found users with similar tastes who loved this content. This social intelligence approach leverages the collective wisdom of viewers like you.',
      icon: Heart,
    },
    'content_based': {
      title: 'Genre & Metadata Matching',
      description: 'This recommendation directly matches the genres, themes, and characteristics you\'ve shown preference for. It\'s a tried-and-true approach based on your explicit tastes.',
      icon: Target,
    },
    'trending': {
      title: 'Popular & Trending',
      description: 'This content is currently popular and highly rated by the community. Sometimes the crowd wisdom leads to great discoveries!',
      icon: TrendingUp,
    },
    'dynamic_weights': {
      title: 'Adaptive Learning',
      description: 'Our system continuously learns from your interactions and dynamically adjusts to your evolving preferences. This strategy adapts in real-time to what you love.',
      icon: Sparkles,
    },
    'hybrid_ensemble': {
      title: 'Multi-Strategy Ensemble',
      description: 'We combined multiple recommendation approaches (neural networks, collaborative filtering, and content matching) to give you the best of all worlds.',
      icon: Brain,
    },
    'exploration_random': {
      title: 'Discovery & Exploration',
      description: 'We\'re helping you discover something new! This serendipitous recommendation helps you break out of your comfort zone and find unexpected gems.',
      icon: Sparkles,
    },
    'pipeline': {
      title: 'Multi-Stage Pipeline',
      description: 'We used our advanced multi-stage recommendation pipeline that combines candidate generation, intelligent ranking, and diversity optimization for the best results.',
      icon: Brain,
    },
  };

  return strategyMap[strategy] || {
    title: 'Intelligent Recommendation',
    description: 'Our AI system selected this recommendation using advanced machine learning techniques tailored to your preferences.',
    icon: Brain,
  };
};

export function ExplanationDialog({
  isOpen,
  onClose,
  tmdbId,
  mediaType,
  title,
  recommendationScore,
  recommendationDiversity,
  recommendationStrategy,
  experimentId,
}: ExplanationDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [feedbackGiven, setFeedbackGiven] = useState(false);

  // Fetch explanation from API
  const { data, isLoading, error } = useQuery<{ explanation: Explanation }>({
    queryKey: ['/api/recommendations/explain', user?.id, tmdbId, mediaType],
    enabled: isOpen && !!user?.id,
    queryFn: async () => {
      const response = await fetch(
        `/api/recommendations/explain/${user?.id}/${tmdbId}?mediaType=${mediaType}`
      );
      if (!response.ok) throw new Error('Failed to fetch explanation');
      return response.json();
    },
  });

  const explanation = data?.explanation;

  // Feedback mutation for contextual bandits and general feedback
  const feedbackMutation = useMutation({
    mutationFn: async (outcomeType: "preference_positive" | "preference_negative") => {
      // If we have an experimentId, use the bandit reward endpoint
      if (experimentId) {
        return apiRequest("POST", `/api/recommendations/bandit/update-reward`, {
          experimentId,
          outcomeType
        });
      }
      
      // Otherwise, use the general interaction tracking endpoint
      return apiRequest("POST", `/api/recommendations/interaction`, {
        recommendationId: `${tmdbId}-${mediaType}`,
        userId: user?.id,
        interactionType: outcomeType === "preference_positive" ? "rated_high" : "dismissed"
      });
    },
    onSuccess: (_, outcomeType) => {
      setFeedbackGiven(true);
      toast({
        title: "Feedback received!",
        description: outcomeType === "preference_positive" 
          ? "Thanks! We'll recommend more like this." 
          : "Thanks! We'll adjust future recommendations.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to submit feedback. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleFeedback = (positive: boolean) => {
    const outcomeType = positive ? "preference_positive" : "preference_negative";
    feedbackMutation.mutate(outcomeType);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid="dialog-explanation">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Why We Recommended "{title}"
          </DialogTitle>
          <DialogDescription>
            Here's why we think you'll love this {mediaType === 'tv' ? 'show' : 'movie'}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="py-8 text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
            <p className="mt-4 text-sm text-muted-foreground">Analyzing recommendation...</p>
          </div>
        )}

        {error && (
          <div className="py-8 text-center">
            <p className="text-sm text-destructive">Failed to load explanation</p>
          </div>
        )}

        {explanation && (
          <div className="space-y-6">
            {/* Recommendation Metrics */}
            {(recommendationScore !== undefined || recommendationDiversity !== undefined || recommendationStrategy) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-muted/50 rounded-lg">
                {recommendationScore !== undefined && (
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-1">Match Score</div>
                    <Badge variant="secondary" className="text-sm font-semibold">
                      {(recommendationScore * 100).toFixed(0)}%
                    </Badge>
                  </div>
                )}
                {recommendationDiversity !== undefined && (
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-1">Diversity</div>
                    <Badge variant="secondary" className="text-sm font-semibold">
                      {(recommendationDiversity * 100).toFixed(0)}%
                    </Badge>
                  </div>
                )}
                {recommendationStrategy && (
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-1">Strategy</div>
                    <Badge variant="outline" className="text-sm">
                      {recommendationStrategy.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                    </Badge>
                  </div>
                )}
              </div>
            )}

            {/* Primary Reason */}
            <div className="rounded-lg bg-primary/10 p-4 border border-primary/20">
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Why We Recommend This
              </h4>
              <p className="text-sm" data-testid="text-primary-reason">
                {explanation.primaryReason}
              </p>
              {explanation.explanationText && (
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed" data-testid="text-detailed-explanation">
                  {explanation.explanationText}
                </p>
              )}
            </div>

            {/* Strategy Explanation Card */}
            {recommendationStrategy && (
              <Card className="border-2" style={{ borderColor: getDiversityBorderColor(recommendationDiversity || 0.5) }}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    {(() => {
                      const strategyInfo = getStrategyExplanation(recommendationStrategy);
                      const StrategyIcon = strategyInfo.icon;
                      return (
                        <>
                          <StrategyIcon className="h-5 w-5" />
                          {strategyInfo.title}
                        </>
                      );
                    })()}
                  </CardTitle>
                  <CardDescription>
                    {getStrategyExplanation(recommendationStrategy).description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Contextual Factors */}
                  <div className="space-y-2">
                    <h5 className="text-sm font-semibold flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Why This Strategy?
                    </h5>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
                        <span>Your viewing patterns suggest a preference for {recommendationStrategy.includes('neural') ? 'deep, personalized recommendations' : 'proven, community-validated content'}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Clock className="h-4 w-4 mt-0.5 text-blue-500 flex-shrink-0" />
                        <span>Time of day and recent activity align with this approach</span>
                      </li>
                      {recommendationDiversity !== undefined && (
                        <li className="flex items-start gap-2">
                          {getDiversityIcon(recommendationDiversity)}
                          <span>{getDiversityDescription(recommendationDiversity)}</span>
                        </li>
                      )}
                    </ul>
                  </div>

                  {/* Diversity Benefits */}
                  {recommendationDiversity !== undefined && (
                    <div className="pt-3 border-t">
                      <h5 className="text-sm font-semibold mb-2">Benefits</h5>
                      <div className="flex flex-wrap gap-2">
                        {getDiversityBenefits(recommendationDiversity).map((benefit, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs">
                            {benefit}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Visual Breakdown with Interactive Pie Chart */}
            {explanation.visualBreakdown && explanation.visualBreakdown.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recommendation Breakdown</CardTitle>
                  <CardDescription>
                    Visual analysis of why we recommended this content
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Interactive Pie Chart */}
                  <div className="w-full h-[280px]" data-testid="chart-feature-importance">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={explanation.visualBreakdown.map(item => ({
                            name: item.featureName,
                            value: item.percentage,
                            color: item.color
                          }))}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={(entry) => `${entry.value.toFixed(0)}%`}
                          outerRadius={90}
                          innerRadius={50}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {explanation.visualBreakdown.map((item, index) => (
                            <Cell key={`cell-${index}`} fill={item.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => `${value.toFixed(1)}%`}
                          contentStyle={{
                            backgroundColor: 'hsl(var(--background))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '6px',
                          }}
                        />
                        <Legend 
                          verticalAlign="bottom" 
                          height={36}
                          iconType="circle"
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Detailed Breakdown List */}
                  <div className="space-y-2">
                    {explanation.visualBreakdown.map((item, index) => {
                      const Icon = getFeatureIcon(item.featureName);
                      return (
                        <div key={index} className="space-y-1" data-testid={`breakdown-item-${index}`}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2">
                              <Icon className="h-4 w-4" style={{ color: item.color }} />
                              {item.featureName}
                            </span>
                            <span className="font-medium">{item.percentage.toFixed(0)}%</span>
                          </div>
                          <div className="h-2 bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${item.percentage}%`,
                                backgroundColor: item.color,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Contributing Factors */}
            {explanation.contributingFactors && explanation.contributingFactors.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Contributing Factors</h4>
                <div className="space-y-2">
                  {explanation.contributingFactors.map((factor, index) => {
                    const Icon = getFeatureIcon(factor.featureName);
                    return (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                        data-testid={`factor-item-${index}`}
                      >
                        <Icon className="h-5 w-5 mt-0.5 flex-shrink-0 text-primary" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-medium text-sm">{factor.featureName}</span>
                            <Badge variant="outline" className="text-xs">
                              {factor.percentageContribution.toFixed(0)}%
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {factor.humanReadable}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Feedback Section */}
            <div className="pt-4 border-t">
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-center">Was this recommendation helpful?</h4>
                {!feedbackGiven ? (
                  <div className="flex justify-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleFeedback(true)}
                      disabled={feedbackMutation.isPending}
                      className="flex-1 max-w-[140px]"
                      data-testid="button-feedback-positive"
                    >
                      <ThumbsUp className="h-4 w-4 mr-2" />
                      Yes, helpful
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleFeedback(false)}
                      disabled={feedbackMutation.isPending}
                      className="flex-1 max-w-[140px]"
                      data-testid="button-feedback-negative"
                    >
                      <ThumbsDown className="h-4 w-4 mr-2" />
                      Not helpful
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-green-600 dark:text-green-400 text-center" data-testid="text-feedback-thanks">
                    ✓ Thanks for your feedback! This helps us improve recommendations.
                  </p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                variant="outline"
                onClick={onClose}
                data-testid="button-close-explanation"
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
