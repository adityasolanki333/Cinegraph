import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Variant {
  id: string;
  name: string;
  type: string;
  config: { endpoint: string; description: string };
  trafficAllocation: number;
}

export function ABExperimentCreator() {
  const [open, setOpen] = useState(false);
  const [experimentName, setExperimentName] = useState("");
  const [description, setDescription] = useState("");
  const [sampleSize, setSampleSize] = useState(1000);
  const [variants, setVariants] = useState<Variant[]>([
    {
      id: "control",
      name: "Control: Hybrid",
      type: "hybrid_ensemble",
      config: {
        endpoint: "/api/recommendations/hybrid",
        description: "Traditional hybrid recommendation"
      },
      trafficAllocation: 0.5,
    },
    {
      id: "variant-a",
      name: "Variant A: Pipeline",
      type: "hybrid_ensemble",
      config: {
        endpoint: "/api/recommendations/pipeline",
        description: "Multi-stage pipeline"
      },
      trafficAllocation: 0.5,
    },
  ]);
  const { toast } = useToast();

  const createExperimentMutation = useMutation({
    mutationFn: async () => {
      // Validate traffic allocation
      const totalAllocation = variants.reduce((sum, v) => sum + v.trafficAllocation, 0);
      if (Math.abs(totalAllocation - 1.0) > 0.01) {
        throw new Error("Traffic allocation must sum to 100%");
      }

      return apiRequest("POST", "/api/ab-testing/experiments", {
        name: experimentName,
        description,
        sampleSize,
        variants: variants.map(v => ({
          id: v.id,
          name: v.name,
          type: v.type,
          config: v.config,
          trafficAllocation: v.trafficAllocation,
        })),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ab-testing/experiments"] });
      toast({
        title: "Experiment Created!",
        description: `${experimentName} has been created. Start it to begin testing.`,
      });
      setOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Create Experiment",
        description: error.message || "Please check your configuration.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setExperimentName("");
    setDescription("");
    setSampleSize(1000);
    setVariants([
      {
        id: "control",
        name: "Control: Hybrid",
        type: "hybrid_ensemble",
        config: {
          endpoint: "/api/recommendations/hybrid",
          description: "Traditional hybrid recommendation"
        },
        trafficAllocation: 0.5,
      },
      {
        id: "variant-a",
        name: "Variant A: Pipeline",
        type: "hybrid_ensemble",
        config: {
          endpoint: "/api/recommendations/pipeline",
          description: "Multi-stage pipeline"
        },
        trafficAllocation: 0.5,
      },
    ]);
  };

  const addVariant = () => {
    setVariants([
      ...variants,
      {
        id: `variant-${variants.length}`,
        name: `Variant ${String.fromCharCode(65 + variants.length - 1)}`,
        type: "hybrid_ensemble",
        config: {
          endpoint: "/api/recommendations/hybrid",
          description: ""
        },
        trafficAllocation: 0,
      },
    ]);
  };

  const removeVariant = (index: number) => {
    if (variants.length > 2) {
      setVariants(variants.filter((_, i) => i !== index));
    }
  };

  const updateVariant = (index: number, field: keyof Variant, value: any) => {
    const newVariants = [...variants];
    if (field === 'trafficAllocation') {
      newVariants[index][field] = parseFloat(value) || 0;
    } else if (field === 'config') {
      newVariants[index][field] = value;
    } else {
      (newVariants[index] as any)[field] = value;
    }
    setVariants(newVariants);
  };

  const totalAllocation = variants.reduce((sum, v) => sum + v.trafficAllocation, 0);
  const allocationError = Math.abs(totalAllocation - 1.0) > 0.01;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-experiment">
          <Plus className="h-4 w-4 mr-2" />
          Create Experiment
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create A/B Test Experiment</DialogTitle>
          <DialogDescription>
            Compare different recommendation algorithms to find the best performer
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Experiment Name</Label>
            <Input
              id="name"
              value={experimentName}
              onChange={(e) => setExperimentName(e.target.value)}
              placeholder="e.g., Recommendation Algorithm Comparison"
              data-testid="input-experiment-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are you testing?"
              data-testid="input-experiment-description"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sample-size">Sample Size</Label>
            <Input
              id="sample-size"
              type="number"
              value={sampleSize}
              onChange={(e) => setSampleSize(parseInt(e.target.value) || 1000)}
              data-testid="input-sample-size"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Variants</Label>
              <Button size="sm" variant="outline" onClick={addVariant} data-testid="button-add-variant">
                <Plus className="h-3 w-3 mr-1" />
                Add Variant
              </Button>
            </div>

            {variants.map((variant, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">
                    {index === 0 ? "Control" : `Variant ${String.fromCharCode(65 + index - 1)}`}
                  </Label>
                  {variants.length > 2 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeVariant(index)}
                      data-testid={`button-remove-variant-${index}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={variant.name}
                      onChange={(e) => updateVariant(index, "name", e.target.value)}
                      placeholder="Variant name"
                      data-testid={`input-variant-name-${index}`}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Algorithm</Label>
                    <Select
                      value={variant.type}
                      onValueChange={(value) => updateVariant(index, "type", value)}
                    >
                      <SelectTrigger data-testid={`select-variant-type-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hybrid_ensemble">Hybrid Ensemble</SelectItem>
                        <SelectItem value="tensorflow_neural">TensorFlow Neural</SelectItem>
                        <SelectItem value="collaborative">Collaborative Filtering</SelectItem>
                        <SelectItem value="content_based">Content-Based</SelectItem>
                        <SelectItem value="trending">Trending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Traffic Allocation (%)</Label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={Math.round(variant.trafficAllocation * 100)}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value) || 0;
                        updateVariant(index, "trafficAllocation", value / 100);
                      }}
                      data-testid={`input-variant-allocation-${index}`}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Endpoint</Label>
                    <Input
                      value={variant.config.endpoint}
                      onChange={(e) =>
                        updateVariant(index, "config", { ...variant.config, endpoint: e.target.value })
                      }
                      placeholder="/api/recommendations/..."
                      data-testid={`input-variant-endpoint-${index}`}
                    />
                  </div>
                </div>
              </div>
            ))}

            {allocationError && (
              <p className="text-sm text-destructive">
                Traffic allocation must sum to 100% (currently {(totalAllocation * 100).toFixed(0)}%)
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel">
            Cancel
          </Button>
          <Button
            onClick={() => createExperimentMutation.mutate()}
            disabled={
              !experimentName.trim() ||
              !description.trim() ||
              sampleSize <= 0 ||
              allocationError ||
              variants.some(v => !v.name.trim() || !v.config.endpoint.trim()) ||
              createExperimentMutation.isPending
            }
            data-testid="button-submit-experiment"
          >
            {createExperimentMutation.isPending ? "Creating..." : "Create Experiment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
