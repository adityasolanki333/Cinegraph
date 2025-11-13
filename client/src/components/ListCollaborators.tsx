import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, UserPlus, Trash2, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ListCollaborator } from "@shared/schema";

interface CollaboratorWithUser extends ListCollaborator {
  user?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
  };
  inviter?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
  };
}

interface ListCollaboratorsProps {
  listId: string;
  isOwner: boolean;
}

export function ListCollaborators({ listId, isOwner }: ListCollaboratorsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');

  const { data: collaborators = [], isLoading } = useQuery<CollaboratorWithUser[]>({
    queryKey: ['/api/community/lists', listId, 'collaborators'],
    enabled: !!listId,
  });

  const { data: searchResults = [] } = useQuery<any[]>({
    queryKey: ['/api/community/users/search', searchQuery],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];
      const response = await fetch(`/api/community/users/search?q=${encodeURIComponent(searchQuery)}&limit=10`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: searchQuery.length >= 2,
  });

  const addCollaboratorMutation = useMutation({
    mutationFn: async (data: { userId: string; permission: string }) => {
      return apiRequest('POST', `/api/community/lists/${listId}/collaborators`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists', listId, 'collaborators'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists', listId] });
      toast({
        title: "Collaborator added",
        description: "The user has been added as a collaborator.",
      });
      setShowAddDialog(false);
      setSearchQuery('');
      setSelectedUserId('');
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add collaborator. They may already be a collaborator.",
        variant: "destructive",
      });
    },
  });

  const updatePermissionMutation = useMutation({
    mutationFn: async ({ collaboratorId, permission }: { collaboratorId: string; permission: string }) => {
      return apiRequest('PUT', `/api/community/lists/${listId}/collaborators/${collaboratorId}`, { permission });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists', listId, 'collaborators'] });
      toast({
        title: "Permission updated",
        description: "Collaborator permission has been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update permission.",
        variant: "destructive",
      });
    },
  });

  const removeCollaboratorMutation = useMutation({
    mutationFn: async (collaboratorId: string) => {
      return apiRequest('DELETE', `/api/community/lists/${listId}/collaborators/${collaboratorId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists', listId, 'collaborators'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists', listId] });
      toast({
        title: "Collaborator removed",
        description: "The collaborator has been removed from this list.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to remove collaborator.",
        variant: "destructive",
      });
    },
  });

  const handleAddCollaborator = () => {
    if (!selectedUserId) {
      toast({
        title: "No user selected",
        description: "Please select a user to add as a collaborator.",
        variant: "destructive",
      });
      return;
    }

    addCollaboratorMutation.mutate({
      userId: selectedUserId,
      permission: 'editor',
    });
  };

  const filteredSearchResults = searchResults.filter(
    (searchUser) =>
      searchUser.id !== user?.id &&
      !collaborators.some((collab) => collab.userId === searchUser.id)
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span data-testid="text-collaborators-heading">
                Collaborators ({collaborators.length})
              </span>
            </CardTitle>
            {isOwner && (
              <Button
                size="sm"
                onClick={() => setShowAddDialog(true)}
                data-testid="button-add-collaborator"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center space-x-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : collaborators.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-collaborators">
              <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p>No collaborators yet</p>
              {isOwner && (
                <p className="text-sm mt-2">Add collaborators to work on this list together</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {collaborators.map((collaborator) => (
                <div
                  key={collaborator.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-accent transition-colors"
                  data-testid={`collaborator-${collaborator.id}`}
                >
                  <div className="flex items-center space-x-3">
                    <Avatar>
                      <AvatarImage src={collaborator.user?.profileImageUrl || undefined} />
                      <AvatarFallback>
                        {collaborator.user?.firstName?.[0] || collaborator.user?.lastName?.[0] || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium" data-testid={`text-collaborator-name-${collaborator.id}`}>
                        {collaborator.user?.firstName} {collaborator.user?.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Invited by {collaborator.inviter?.firstName} {collaborator.inviter?.lastName}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {isOwner ? (
                      <>
                        <Select
                          value={collaborator.permission}
                          onValueChange={(value) =>
                            updatePermissionMutation.mutate({
                              collaboratorId: collaborator.id,
                              permission: value,
                            })
                          }
                        >
                          <SelectTrigger className="w-28" data-testid={`select-permission-${collaborator.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeCollaboratorMutation.mutate(collaborator.id)}
                          disabled={removeCollaboratorMutation.isPending}
                          data-testid={`button-remove-${collaborator.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    ) : (
                      <Badge variant="outline" data-testid={`badge-permission-${collaborator.id}`}>
                        {collaborator.permission}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Collaborator Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent data-testid="dialog-add-collaborator">
          <DialogHeader>
            <DialogTitle>Add Collaborator</DialogTitle>
            <DialogDescription>
              Search for a user to add as a collaborator to this list
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users by name..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-users"
                />
              </div>
            </div>

            {searchQuery.length >= 2 && (
              <div className="max-h-64 overflow-y-auto space-y-2">
                {filteredSearchResults.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4" data-testid="text-no-users-found">
                    No users found
                  </p>
                ) : (
                  filteredSearchResults.map((searchUser) => (
                    <button
                      key={searchUser.id}
                      className={`w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-accent transition-colors ${
                        selectedUserId === searchUser.id ? 'bg-accent' : ''
                      }`}
                      onClick={() => setSelectedUserId(searchUser.id)}
                      data-testid={`user-result-${searchUser.id}`}
                    >
                      <Avatar>
                        <AvatarImage src={searchUser.profileImageUrl || undefined} />
                        <AvatarFallback>
                          {searchUser.firstName?.[0] || searchUser.lastName?.[0] || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left">
                        <p className="font-medium">
                          {searchUser.firstName} {searchUser.lastName}
                        </p>
                        {searchUser.stats && (
                          <p className="text-xs text-muted-foreground">
                            {searchUser.stats.totalReviews} reviews · Level {searchUser.stats.userLevel}
                          </p>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAddDialog(false);
                setSearchQuery('');
                setSelectedUserId('');
              }}
              data-testid="button-cancel-add-collaborator"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddCollaborator}
              disabled={!selectedUserId || addCollaboratorMutation.isPending}
              data-testid="button-submit-add-collaborator"
            >
              Add Collaborator
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
