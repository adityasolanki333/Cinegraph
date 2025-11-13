import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Users,
  Heart,
  Loader2,
  Lock,
  Globe,
  GripVertical,
  Save,
  X,
  List,
  Film,
  Layers,
} from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { SimilarLists } from "@/components/similar-lists";
import { ListCollaboratorManager } from "@/components/ListCollaboratorManager";
import MovieCard from "@/components/movie-card";
import type { Movie } from "@shared/schema";
import { tmdbService } from "@/lib/tmdb";

// Component to fetch and display list item with full TMDB metadata
function ListItemCard({ item, isOwnList, onRemove }: { item: any; isOwnList: boolean; onRemove: () => void }) {
  const mediaType = item.mediaType === 'tv' ? 'tv' : 'movie';
  const { data: tmdbData, isLoading } = useQuery({
    queryKey: [`/api/tmdb/${mediaType}/${item.tmdbId}`],
    enabled: !!item.tmdbId,
  });

  if (isLoading) {
    return (
      <Card>
        <div className="aspect-[2/3] bg-muted animate-pulse" />
        <CardContent className="p-4">
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-3 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (!tmdbData) {
    // Fallback with minimal data if TMDB fetch fails
    const fallbackMovie: Movie = {
      id: item.tmdbId.toString(),
      title: item.title,
      year: 0,
      genre: "",
      rating: 0,
      synopsis: "",
      posterUrl: item.posterPath ? `https://image.tmdb.org/t/p/w342${item.posterPath}` : null,
      director: "",
      cast: [],
      duration: 0,
      type: item.mediaType === "tv" ? "tv" : "movie",
      seasons: null,
    };

    return (
      <MovieCard
        movie={fallbackMovie}
        showRemoveButton={isOwnList}
        onRemoveFromWatchlist={onRemove}
      />
    );
  }

  // Convert TMDB data to Movie format
  const movie = tmdbService.convertToMovie(tmdbData as any, item.mediaType);

  return (
    <MovieCard
      movie={movie}
      showRemoveButton={isOwnList}
      onRemoveFromWatchlist={onRemove}
    />
  );
}

export default function ListDetail() {
  const [match, params] = useRoute<{ id: string }>("/lists/:id");
  const [, setLocation] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editIsPublic, setEditIsPublic] = useState(true);
  const [editingNoteItemId, setEditingNoteItemId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const listId = params?.id;

  const { data: list, isLoading: listLoading } = useQuery<{
    id: string;
    title: string;
    description?: string;
    isPublic: boolean;
    itemCount: number;
    followerCount: number;
    user?: {
      id: string;
      firstName: string;
      lastName: string;
      profileImageUrl?: string;
    };
    items?: Array<{
      id: string;
      tmdbId: number;
      mediaType: string;
      title: string;
      posterPath?: string;
      note?: string;
      position: number;
    }>;
  }>({
    queryKey: ['/api/community/lists', listId],
    enabled: !!listId,
  });

  const { data: isFollowing, isLoading: isFollowingLoading } = useQuery({
    queryKey: ['/api/community/lists', listId, 'is-following'],
    enabled: !!user?.id && !!listId && list?.user?.id !== user?.id,
  });

  const isOwnList = user?.id === list?.user?.id;

  const followMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/community/lists/${listId}/follow`, {});
    },
    onMutate: async () => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['/api/community/lists', listId, 'is-following'] });
      
      // Snapshot the previous value
      const previousValue = queryClient.getQueryData(['/api/community/lists', listId, 'is-following']);
      
      // Optimistically update to the new value
      queryClient.setQueryData(['/api/community/lists', listId, 'is-following'], true);
      
      // Return a context object with the snapshotted value
      return { previousValue };
    },
    onError: (err, variables, context) => {
      // Rollback to the previous value
      if (context?.previousValue !== undefined) {
        queryClient.setQueryData(['/api/community/lists', listId, 'is-following'], context.previousValue);
      }
      toast({
        title: "Error",
        description: "Failed to follow list. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists', listId] });
      toast({
        title: "Following list",
        description: `You are now following "${list?.title}".`,
      });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('DELETE', `/api/community/lists/${listId}/follow`);
    },
    onMutate: async () => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['/api/community/lists', listId, 'is-following'] });
      
      // Snapshot the previous value
      const previousValue = queryClient.getQueryData(['/api/community/lists', listId, 'is-following']);
      
      // Optimistically update to the new value
      queryClient.setQueryData(['/api/community/lists', listId, 'is-following'], false);
      
      // Return a context object with the snapshotted value
      return { previousValue };
    },
    onError: (err, variables, context) => {
      // Rollback to the previous value
      if (context?.previousValue !== undefined) {
        queryClient.setQueryData(['/api/community/lists', listId, 'is-following'], context.previousValue);
      }
      toast({
        title: "Error",
        description: "Failed to unfollow list. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists', listId] });
      toast({
        title: "Unfollowed list",
        description: `You have unfollowed "${list?.title}".`,
      });
    },
  });

  const deleteListMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('DELETE', `/api/community/lists/${listId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists'] });
      // Invalidate user's lists so it disappears from "My Lists"
      queryClient.invalidateQueries({ queryKey: ['/api/community/users', user?.id, 'lists'] });
      // Invalidate containing lists for Similar > Lists tabs
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists/containing'] });
      toast({
        title: "List deleted",
        description: "Your list has been deleted successfully.",
      });
      setLocation('/community');
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete list. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateListMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('PUT', `/api/community/lists/${listId}`, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        isPublic: editIsPublic,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists', listId] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/users', user?.id, 'lists'] });
      toast({
        title: "List updated",
        description: "Your list has been updated successfully.",
      });
      setShowEditDialog(false);
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "Failed to update list. Please try again.";
      const isNotFound = errorMessage.includes("not found") || errorMessage.includes("404");
      
      toast({
        title: isNotFound ? "List Not Found" : "Error",
        description: isNotFound 
          ? "This list has been deleted and can no longer be edited." 
          : errorMessage,
        variant: "destructive",
      });
      
      // If list not found, close dialog and refresh
      if (isNotFound) {
        setShowEditDialog(false);
        setTimeout(() => setLocation('/community'), 1000);
      }
    },
  });

  const removeItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return apiRequest('DELETE', `/api/community/lists/${listId}/items/${itemId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists', listId] });
      toast({
        title: "Item removed",
        description: "Item has been removed from the list.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove item. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ itemId, note }: { itemId: string; note: string }) => {
      return apiRequest('PUT', `/api/community/lists/${listId}/items/${itemId}`, {
        note: note.trim() || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists', listId] });
      toast({
        title: "Note updated",
        description: "Item note has been updated.",
      });
      setEditingNoteItemId(null);
      setNoteText("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update note. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFollowToggle = () => {
    if (!isAuthenticated) {
      toast({
        title: "Login required",
        description: "Please log in to follow lists.",
        variant: "destructive",
      });
      return;
    }

    if (isFollowing) {
      unfollowMutation.mutate();
    } else {
      followMutation.mutate();
    }
  };

  const handleEditClick = () => {
    if (list) {
      setEditTitle(list.title || "");
      setEditDescription(list.description || "");
      setEditIsPublic(list.isPublic ?? true);
      setShowEditDialog(true);
    }
  };

  const handleEditNote = (item: any) => {
    setEditingNoteItemId(item.id);
    setNoteText(item.note || "");
  };

  const handleSaveNote = (itemId: string) => {
    updateNoteMutation.mutate({ itemId, note: noteText });
  };

  if (!match) return null;

  if (listLoading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-24 w-full mb-8" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[...Array(10)].map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3]" />
          ))}
        </div>
      </div>
    );
  }

  if (!list) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">List not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <Button
        variant="ghost"
        onClick={() => setLocation('/community')}
        className="mb-4"
        data-testid="button-back-to-community"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Community
      </Button>

      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-start gap-3 mb-2">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold flex-1" data-testid="heading-list-title">
                {list.title}
              </h1>
              <Badge variant={list.isPublic ? "secondary" : "outline"} className="flex-shrink-0">
                {list.isPublic ? (
                  <>
                    <Globe className="h-3 w-3 mr-1" />
                    Public
                  </>
                ) : (
                  <>
                    <Lock className="h-3 w-3 mr-1" />
                    Private
                  </>
                )}
              </Badge>
            </div>
            {list.description && (
              <p className="text-muted-foreground text-sm sm:text-base md:text-lg" data-testid="text-list-description">
                {list.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-sm text-muted-foreground">
            {list.user && (
              <Link href={`/profile/${list.user.id}`}>
                <div className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                  <Avatar className="h-7 w-7 sm:h-8 sm:w-8">
                    <AvatarImage src={list.user.profileImageUrl} />
                    <AvatarFallback>
                      {list.user.firstName?.[0]}{list.user.lastName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium" data-testid="text-list-creator">
                    {list.user.firstName} {list.user.lastName}
                  </span>
                </div>
              </Link>
            )}
            <span data-testid="text-item-count">{list.itemCount || 0} items</span>
            <span className="flex items-center" data-testid="text-follower-count">
              <Users className="h-4 w-4 mr-1" />
              {list.followerCount || 0}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {!isOwnList && isAuthenticated && (
              <Button
                variant={isFollowing ? "outline" : "default"}
                onClick={handleFollowToggle}
                disabled={isFollowingLoading || followMutation.isPending || unfollowMutation.isPending}
                data-testid="button-follow-list"
                className="flex-1 sm:flex-none"
              >
                {followMutation.isPending || unfollowMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : isFollowing ? (
                  <Heart className="h-4 w-4 mr-2 fill-current" />
                ) : (
                  <Heart className="h-4 w-4 mr-2" />
                )}
                {isFollowing ? "Following" : "Follow"}
              </Button>
            )}
            {isOwnList && (
              <>
                <Button variant="outline" onClick={handleEditClick} data-testid="button-edit-list" className="flex-1 sm:flex-none">
                  <Edit className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive hover:text-destructive flex-1 sm:flex-none"
                  data-testid="button-delete-list"
                >
                  <Trash2 className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Delete</span>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {list.items && list.items.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {list.items.map((item: any) => {
            return (
              <div key={item.id} className="space-y-2" data-testid={`list-item-${item.id}`}>
                <ListItemCard 
                  item={item} 
                  isOwnList={isOwnList}
                  onRemove={() => removeItemMutation.mutate(item.id)}
                />
                {editingNoteItemId === item.id ? (
                  <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                    <Textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Add a note..."
                      className="text-xs min-h-[60px]"
                      data-testid={`textarea-note-${item.id}`}
                    />
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        onClick={() => handleSaveNote(item.id)}
                        disabled={updateNoteMutation.isPending}
                        data-testid={`button-save-note-${item.id}`}
                      >
                        <Save className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingNoteItemId(null);
                          setNoteText("");
                        }}
                        data-testid={`button-cancel-note-${item.id}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {item.note && (
                      <p className="text-xs text-muted-foreground line-clamp-2 px-2" data-testid={`text-item-note-${item.id}`}>
                        {item.note}
                      </p>
                    )}
                    {isOwnList && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-6 px-2 w-full"
                        onClick={() => handleEditNote(item)}
                        data-testid={`button-edit-note-${item.id}`}
                      >
                        {item.note ? "Edit note" : "Add note"}
                      </Button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="max-w-md mx-auto">
              <List className="h-12 w-12 sm:h-16 sm:w-16 mx-auto text-muted-foreground/50 mb-4 sm:mb-6 animate-pulse" />
              <h3 className="text-lg sm:text-xl font-semibold mb-2">This list is empty</h3>
              <p className="text-sm sm:text-base text-muted-foreground mb-4 sm:mb-6 px-4 sm:px-0">
                {isOwnList 
                  ? "Start adding movies and TV shows to build your collection!" 
                  : "The creator hasn't added any items yet."}
              </p>
              {isOwnList && (
                <Button className="inline-flex items-center gap-2" asChild>
                  <Link href="/movies">
                    <Film className="h-4 w-4" />
                    Browse Movies
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Collaborators Section */}
      <div className="mt-8">
        <ListCollaboratorManager listId={listId!} isOwner={isOwnList} />
      </div>

      {/* Similar Lists Section */}
      {list?.items && list.items.length > 0 && (
        <div className="mt-12" data-testid="similar-lists-section">
          <div className="flex items-center gap-2 mb-6">
            <Layers className="h-5 w-5 text-primary" />
            <h2 className="text-xl sm:text-2xl font-bold">Similar Lists</h2>
          </div>
          <SimilarLists listId={listId!} />
        </div>
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent data-testid="dialog-delete-list">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete List</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{list.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteListMutation.mutate()}
              disabled={deleteListMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteListMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[500px]" data-testid="dialog-edit-list">
          <DialogHeader>
            <DialogTitle>Edit List</DialogTitle>
            <DialogDescription>Update your list details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={100}
                data-testid="input-edit-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                maxLength={500}
                data-testid="textarea-edit-description"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="edit-public">Public List</Label>
                <p className="text-sm text-muted-foreground">
                  Allow others to view and follow this list
                </p>
              </div>
              <Switch
                id="edit-public"
                checked={editIsPublic}
                onCheckedChange={setEditIsPublic}
                data-testid="switch-edit-public"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowEditDialog(false)}
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
              <Button
                onClick={() => updateListMutation.mutate()}
                disabled={!editTitle.trim() || updateListMutation.isPending}
                data-testid="button-save-edit"
              >
                {updateListMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
