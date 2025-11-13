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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Plus, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface CreateListDialogProps {
  onSuccess?: (listId: string) => void;
  trigger?: React.ReactNode;
}

export function CreateListDialog({ onSuccess, trigger }: CreateListDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

  const createListMutation = useMutation({
    mutationFn: async () => {
      if (!isAuthenticated) {
        throw new Error("Must be logged in to create a list");
      }

      const response = await apiRequest('POST', '/api/community/lists', {
        title: title.trim(),
        description: description.trim() || null,
        isPublic,
      });
      return response.json() as Promise<{ id: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists'] });
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ['/api/community/users', user.id, 'lists'] });
        queryClient.invalidateQueries({ queryKey: ['/api/community', user.id, 'stats'] });
      }
      // Invalidate community feed to show new list
      queryClient.invalidateQueries({ queryKey: ['/api/community/feed'] });
      toast({
        title: "List created",
        description: "Your list has been created successfully.",
      });
      setTitle("");
      setDescription("");
      setIsPublic(true);
      setOpen(false);
      if (onSuccess && data.id) {
        onSuccess(data.id);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to create list. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast({
        title: "Title required",
        description: "Please enter a title for your list.",
        variant: "destructive",
      });
      return;
    }

    createListMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button data-testid="button-create-list">
            <Plus className="h-4 w-4 mr-2" />
            Create List
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto" data-testid="dialog-create-list">
        <DialogHeader>
          <DialogTitle>Create New List</DialogTitle>
          <DialogDescription>
            Create a curated collection of movies and TV shows to share with the community.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My Favorite Movies"
              maxLength={100}
              disabled={createListMutation.isPending}
              data-testid="input-list-title"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A collection of my all-time favorite films..."
              rows={3}
              maxLength={500}
              disabled={createListMutation.isPending}
              data-testid="textarea-list-description"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="public">Public List</Label>
              <p className="text-sm text-muted-foreground">
                Allow others to view and follow this list
              </p>
            </div>
            <Switch
              id="public"
              checked={isPublic}
              onCheckedChange={setIsPublic}
              disabled={createListMutation.isPending}
              data-testid="switch-list-public"
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={createListMutation.isPending}
              data-testid="button-cancel-create-list"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || createListMutation.isPending}
              data-testid="button-submit-create-list"
            >
              {createListMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create List"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
