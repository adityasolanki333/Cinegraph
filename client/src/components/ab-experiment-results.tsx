import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { BarChart, Target, TrendingUp, TrendingDown, Award } from "lucide-react";

interface ABVariantResult {
  variantId: string;
  variantName: string;
  metrics: {
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    conversionRate: number;
    avgEngagementTime: number;
  };
  isWinner: boolean;
  statisticalSignificance?: {
    pValue: number;
    isSignificant: boolean;
  };
}

export function ABExperimentResults({ experimentId, experimentName }: {
  experimentId: string;
  experimentName: string;
}) {
  const { data: results, isLoading } = useQuery({
    queryKey: ['/api/ab-testing/experiments', experimentId, 'results'],
    queryFn: async () => {
      const response = await fetch(`/api/ab-testing/experiments/${experimentId}/results`);
      if (!response.ok) throw new Error('Failed to fetch results');
      return response.json();
    },
  });

  const variants: ABVariantResult[] = results?.results || [];
  const bestCTR = Math.max(...variants.map(v => v.metrics.ctr || 0));
  const bestConversionRate = Math.max(...variants.map(v => v.metrics.conversionRate || 0));

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" data-testid={`button-view-results-${experimentId}`}>
          <BarChart className="h-3 w-3 mr-1" />
          Results
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{experimentName}</DialogTitle>
          <DialogDescription>Experiment performance metrics and statistical analysis</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">
            Loading results...
          </div>
        ) : variants.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            No data collected yet. Start the experiment and wait for user interactions.
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Variant Comparison */}
            <div className="grid gap-4">
              {variants.map((variant) => {
                const isBestCTR = variant.metrics.ctr === bestCTR && bestCTR > 0;
                const isBestConversion = variant.metrics.conversionRate === bestConversionRate && bestConversionRate > 0;
                
                return (
                  <Card key={variant.variantId} className={variant.isWinner ? "border-primary" : ""}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{variant.variantName}</CardTitle>
                        <div className="flex items-center gap-2">
                          {variant.isWinner && (
                            <Badge className="flex items-center gap-1">
                              <Award className="h-3 w-3" />
                              Winner
                            </Badge>
                          )}
                          {variant.statisticalSignificance?.isSignificant && (
                            <Badge variant="outline">
                              p={variant.statisticalSignificance.pValue.toFixed(3)}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {/* Impressions */}
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Impressions</div>
                          <div className="text-2xl font-bold">{variant.metrics.impressions.toLocaleString()}</div>
                        </div>

                        {/* Clicks */}
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Clicks</div>
                          <div className="text-2xl font-bold">{variant.metrics.clicks.toLocaleString()}</div>
                        </div>

                        {/* CTR */}
                        <div>
                          <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                            Click-Through Rate
                            {isBestCTR && <TrendingUp className="h-3 w-3 text-green-500" />}
                          </div>
                          <div className="text-2xl font-bold">
                            {(variant.metrics.ctr * 100).toFixed(2)}%
                          </div>
                          <Progress 
                            value={(variant.metrics.ctr / (bestCTR || 1)) * 100} 
                            className="h-1 mt-2"
                          />
                        </div>

                        {/* Conversions */}
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Conversions</div>
                          <div className="text-2xl font-bold">{variant.metrics.conversions.toLocaleString()}</div>
                        </div>

                        {/* Conversion Rate */}
                        <div>
                          <div className="text-sm text-muted-foreground mb-1 flex items-center gap-1">
                            Conversion Rate
                            {isBestConversion && <TrendingUp className="h-3 w-3 text-green-500" />}
                          </div>
                          <div className="text-2xl font-bold">
                            {(variant.metrics.conversionRate * 100).toFixed(2)}%
                          </div>
                          <Progress 
                            value={(variant.metrics.conversionRate / (bestConversionRate || 1)) * 100} 
                            className="h-1 mt-2"
                          />
                        </div>

                        {/* Engagement Time */}
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Avg Engagement</div>
                          <div className="text-2xl font-bold">
                            {variant.metrics.avgEngagementTime.toFixed(1)}s
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Summary & Insights */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Key Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {variants.length > 0 && (
                    <>
                      <div className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>
                          Total impressions across all variants: <strong>{variants.reduce((sum, v) => sum + v.metrics.impressions, 0).toLocaleString()}</strong>
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>
                          Best performing variant by CTR: <strong>{variants.reduce((best, v) => v.metrics.ctr > best.metrics.ctr ? v : best).variantName}</strong> ({(bestCTR * 100).toFixed(2)}%)
                        </span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="text-primary">•</span>
                        <span>
                          Best performing variant by conversion rate: <strong>{variants.reduce((best, v) => v.metrics.conversionRate > best.metrics.conversionRate ? v : best).variantName}</strong> ({(bestConversionRate * 100).toFixed(2)}%)
                        </span>
                      </div>
                      {variants.some(v => v.statisticalSignificance?.isSignificant) ? (
                        <div className="flex items-start gap-2">
                          <span className="text-green-500">✓</span>
                          <span className="text-green-600">
                            Results are statistically significant - you can confidently choose the winning variant
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <span className="text-yellow-500">⚠</span>
                          <span className="text-yellow-600">
                            Results not yet statistically significant - continue collecting data
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
