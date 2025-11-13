import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, UserPlus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { InviteCollaboratorDialog } from "./InviteCollaboratorDialog";
import { CollaboratorPermissionBadge } from "./CollaboratorPermissionBadge";
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

interface ListCollaboratorManagerProps {
  listId: string;
  isOwner: boolean;
}

export function ListCollaboratorManager({ listId, isOwner }: ListCollaboratorManagerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showInviteDialog, setShowInviteDialog] = useState(false);

  const { data: collaborators = [], isLoading } = useQuery<CollaboratorWithUser[]>({
    queryKey: ['/api/community/lists', listId, 'collaborators'],
    enabled: !!listId,
  });

  const updatePermissionMutation = useMutation({
    mutationFn: async ({ collaboratorId, permission }: { collaboratorId: string; permission: string }) => {
      return apiRequest('PUT', `/api/community/lists/${listId}/collaborators/${collaboratorId}`, { permission });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists', listId, 'collaborators'] });
      toast({
        title: "Permission updated",
        description: "Collaborator permission has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update permission. Please try again.",
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
        description: "Failed to remove collaborator. Please try again.",
        variant: "destructive",
      });
    },
  });

  const existingCollaboratorIds = collaborators.map(c => c.userId);

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
                onClick={() => setShowInviteDialog(true)}
                data-testid="button-add-collaborator"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add Collaborator
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
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : collaborators.length === 0 ? (
            <div className="text-center py-12" data-testid="text-no-collaborators">
              <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No collaborators yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {isOwner 
                  ? "Invite others to collaborate on this list and build it together!" 
                  : "The list owner hasn't added any collaborators yet."}
              </p>
              {isOwner && (
                <Button onClick={() => setShowInviteDialog(true)} data-testid="button-invite-first-collaborator">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite Collaborator
                </Button>
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
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <Avatar>
                      <AvatarImage src={collaborator.user?.profileImageUrl || undefined} />
                      <AvatarFallback>
                        {collaborator.user?.firstName?.[0] || collaborator.user?.lastName?.[0] || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" data-testid={`text-collaborator-name-${collaborator.id}`}>
                        {collaborator.user?.firstName} {collaborator.user?.lastName}
                      </p>
                      {collaborator.inviter && (
                        <p className="text-xs text-muted-foreground truncate">
                          Invited by {collaborator.inviter.firstName} {collaborator.inviter.lastName}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 flex-shrink-0">
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
                          disabled={updatePermissionMutation.isPending}
                        >
                          <SelectTrigger 
                            className="w-28" 
                            data-testid={`select-permission-${collaborator.id}`}
                          >
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
                          data-testid={`button-remove-collaborator-${collaborator.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    ) : (
                      <CollaboratorPermissionBadge 
                        permission={collaborator.permission as "editor" | "viewer"}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <InviteCollaboratorDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        listId={listId}
        existingCollaboratorIds={existingCollaboratorIds}
        currentUserId={user?.id}
      />
    </>
  );
}
