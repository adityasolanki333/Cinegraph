import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";

/**
 * Hook to integrate A/B testing into recommendation features
 * Assigns users to experiment variants and tracks metrics
 */

interface ABVariant {
  id: string;
  name: string;
  type: string;
  config: {
    description: string;
    endpoint: string;
  };
  trafficAllocation: number;
}

interface ABExperiment {
  id: string;
  name: string;
  status: string;
  variants: ABVariant[];
}

export function useABTest(experimentName: string = 'Recommendation Algorithm Comparison') {
  const { user } = useAuth();

  // Get active experiments
  const { data: experiments } = useQuery({
    queryKey: ['/api/ab-testing/experiments'],
    enabled: !!user,
  });

  // Find the recommendation experiment
  const experiment: ABExperiment | undefined = (experiments as { experiments?: ABExperiment[] })?.experiments?.find(
    (exp: ABExperiment) => exp.name === experimentName && exp.status === 'running'
  );

  // Get or assign variant for current user
  const { data: assignedVariant, isLoading: isAssigning } = useQuery({
    queryKey: ['/api/ab-testing/variant', experiment?.id, user?.id],
    queryFn: async () => {
      if (!experiment || !user) return null;
      
      const response = await fetch(`/api/ab-testing/experiments/${experiment.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      
      if (!response.ok) throw new Error('Failed to assign variant');
      const data = await response.json();
      return data.variant;
    },
    enabled: !!experiment && !!user,
  });

  // Track impression mutation
  const trackImpressionMutation = useMutation({
    mutationFn: async (variantId: string) => {
      if (!experiment || !user) return;
      
      return apiRequest('POST', `/api/ab-testing/experiments/${experiment.id}/track/impression`, {
        variantId,
        userId: user.id,
      });
    },
  });

  // Track click mutation
  const trackClickMutation = useMutation({
    mutationFn: async (variantId: string) => {
      if (!experiment || !user) return;
      
      return apiRequest('POST', `/api/ab-testing/experiments/${experiment.id}/track/click`, {
        variantId,
        userId: user.id,
      });
    },
  });

  // Track conversion mutation (watchlist add, rating, etc.)
  const trackConversionMutation = useMutation({
    mutationFn: async (variantId: string) => {
      if (!experiment || !user) return;
      
      return apiRequest('POST', `/api/ab-testing/experiments/${experiment.id}/track/conversion`, {
        variantId,
        userId: user.id,
      });
    },
  });

  return {
    experiment,
    assignedVariant,
    isAssigning,
    trackImpression: (variantId: string) => trackImpressionMutation.mutate(variantId),
    trackClick: (variantId: string) => trackClickMutation.mutate(variantId),
    trackConversion: (variantId: string) => trackConversionMutation.mutate(variantId),
    // Helper to get the recommendation endpoint for assigned variant
    getRecommendationEndpoint: () => assignedVariant?.config?.endpoint || '/api/recommendations/hybrid',
    // Helper to check if A/B test is active
    isActive: !!experiment && !!assignedVariant,
  };
}
