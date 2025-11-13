import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ListPlus, Loader2, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { CreateListDialog } from "./create-list-dialog";
import { useLocation } from "wouter";

interface AddToListButtonProps {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

export function AddToListButton({
  tmdbId,
  mediaType,
  title,
  posterPath,
  variant = "outline",
  size = "default",
}: AddToListButtonProps) {
  const [open, setOpen] = useState(false);
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: userLists = [], isLoading: listsLoading } = useQuery({
    queryKey: ['/api/community/users', user?.id, 'lists'],
    enabled: open && !!user?.id,
  });

  const addToListMutation = useMutation({
    mutationFn: async (listId: string) => {
      return apiRequest('POST', `/api/community/lists/${listId}/items`, {
        tmdbId,
        mediaType,
        title,
        posterPath: posterPath || null,
      });
    },
    onSuccess: (_, listId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists', listId] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/users', user?.id, 'lists'] });
      toast({
        title: "Added to list",
        description: `"${title}" has been added to your list.`,
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to add to list";
      toast({
        title: "Error",
        description: errorMessage.includes("already exists") 
          ? "This item is already in that list." 
          : errorMessage,
        variant: "destructive",
      });
    },
  });

  const removeFromListMutation = useMutation({
    mutationFn: async ({ listId, itemId }: { listId: string; itemId: string }) => {
      return apiRequest('DELETE', `/api/community/lists/${listId}/items/${itemId}`);
    },
    onSuccess: (_, { listId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists', listId] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/users', user?.id, 'lists'] });
      toast({
        title: "Removed from list",
        description: `"${title}" has been removed from your list.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove from list. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: async (listId: string) => {
      return apiRequest('DELETE', `/api/community/lists/${listId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/users', user?.id, 'lists'] });
      // Invalidate all "lists containing media" queries so deleted list disappears from Similar > Lists tabs
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists/containing'] });
      toast({
        title: "List deleted",
        description: "Your list has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete list. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleOpenChange = (newOpen: boolean) => {
    if (!isAuthenticated && newOpen) {
      toast({
        title: "Login required",
        description: "Please log in to add items to lists.",
        variant: "destructive",
      });
      setTimeout(() => setLocation('/login'), 500);
      return;
    }
    setOpen(newOpen);
  };

  const isInList = (list: any) => {
    return list.items?.some((item: any) => item.tmdbId === tmdbId && item.mediaType === mediaType);
  };

  const getListItem = (list: any) => {
    return list.items?.find((item: any) => item.tmdbId === tmdbId && item.mediaType === mediaType);
  };

  const handleToggleList = (list: any) => {
    const inList = isInList(list);
    if (inList) {
      const item = getListItem(list);
      if (item) {
        removeFromListMutation.mutate({ listId: list.id, itemId: item.id });
      }
    } else {
      addToListMutation.mutate(list.id);
    }
  };

  const handleCreateList = (listId: string) => {
    addToListMutation.mutate(listId);
  };

  const handleDeleteList = (e: React.MouseEvent, listId: string, listTitle: string) => {
    e.stopPropagation(); // Prevent checkbox toggle
    
    if (confirm(`Are you sure you want to delete "${listTitle}"? This action cannot be undone.`)) {
      deleteListMutation.mutate(listId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size} data-testid="button-add-to-list">
          <ListPlus className="h-4 w-4 mr-2" />
          Add to List
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto" data-testid="dialog-add-to-list">
        <DialogHeader>
          <DialogTitle>Add to List</DialogTitle>
          <DialogDescription>
            Choose which lists to add "{title}" to
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <CreateListDialog 
            onSuccess={handleCreateList}
            trigger={
              <Button variant="outline" className="w-full" data-testid="button-create-new-list">
                <Plus className="h-4 w-4 mr-2" />
                Create New List
              </Button>
            }
          />

          <Separator />

          {listsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : Array.isArray(userLists) && userLists.length > 0 ? (
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-3">
                {userLists.map((list: any) => {
                  const inList = isInList(list);
                  const isUpdating = 
                    (addToListMutation.isPending || removeFromListMutation.isPending);
                  
                  return (
                    <div
                      key={list.id}
                      className="flex items-center space-x-3 p-3 rounded-lg hover:bg-muted/50 transition-colors group"
                      data-testid={`list-option-${list.id}`}
                    >
                      <Checkbox
                        checked={inList}
                        disabled={isUpdating}
                        onCheckedChange={() => handleToggleList(list)}
                        data-testid={`checkbox-list-${list.id}`}
                      />
                      <div 
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => !isUpdating && handleToggleList(list)}
                      >
                        <p className="font-medium truncate" data-testid={`text-list-title-${list.id}`}>
                          {list.title}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {list.itemCount || 0} items
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => handleDeleteList(e, list.id, list.title)}
                        disabled={deleteListMutation.isPending}
                        data-testid={`button-delete-list-${list.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">You don't have any lists yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first list to get started!
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
