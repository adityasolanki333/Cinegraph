import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Search, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { insertListCollaboratorSchema } from "@shared/schema";

const inviteCollaboratorFormSchema = insertListCollaboratorSchema
  .omit({ listId: true, invitedBy: true })
  .extend({
    userId: z.string().min(1, "Please select a user"),
    permission: z.enum(["editor", "viewer"], {
      required_error: "Please select a permission level",
    }),
  });

type InviteCollaboratorFormData = z.infer<typeof inviteCollaboratorFormSchema>;

interface InviteCollaboratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  existingCollaboratorIds?: string[];
  currentUserId?: string;
}

export function InviteCollaboratorDialog({
  open,
  onOpenChange,
  listId,
  existingCollaboratorIds = [],
  currentUserId,
}: InviteCollaboratorDialogProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  const form = useForm<InviteCollaboratorFormData>({
    resolver: zodResolver(inviteCollaboratorFormSchema),
    defaultValues: {
      userId: "",
      permission: "editor",
    },
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

  const inviteMutation = useMutation({
    mutationFn: async (data: InviteCollaboratorFormData) => {
      return apiRequest('POST', `/api/community/lists/${listId}/collaborators`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists', listId, 'collaborators'] });
      queryClient.invalidateQueries({ queryKey: ['/api/community/lists', listId] });
      toast({
        title: "Collaborator invited",
        description: "The user has been successfully added as a collaborator.",
      });
      form.reset();
      setSearchQuery("");
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to invite collaborator. They may already be a collaborator.",
        variant: "destructive",
      });
    },
  });

  const filteredSearchResults = searchResults.filter(
    (searchUser) =>
      searchUser.id !== currentUserId &&
      !existingCollaboratorIds.includes(searchUser.id)
  );

  const selectedUserId = form.watch("userId");

  const onSubmit = (data: InviteCollaboratorFormData) => {
    inviteMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-invite-collaborator">
        <DialogHeader>
          <DialogTitle>Invite Collaborator</DialogTitle>
          <DialogDescription>
            Search for a user and choose their permission level to invite them to collaborate on this list.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4">
              {/* Search Users */}
              <div className="space-y-2">
                <Label htmlFor="search">Search Users</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search users by name..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    data-testid="input-search-collaborator"
                  />
                </div>
              </div>

              {/* User Search Results */}
              {searchQuery.length >= 2 && (
                <FormField
                  control={form.control}
                  name="userId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Select User</FormLabel>
                      <FormControl>
                        <div className="max-h-64 overflow-y-auto space-y-2 border rounded-md p-2">
                          {filteredSearchResults.length === 0 ? (
                            <p className="text-center text-muted-foreground py-4" data-testid="text-no-users-found">
                              No users found
                            </p>
                          ) : (
                            filteredSearchResults.map((searchUser) => (
                              <button
                                key={searchUser.id}
                                type="button"
                                className={`w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-accent transition-colors ${
                                  selectedUserId === searchUser.id ? 'bg-accent' : ''
                                }`}
                                onClick={() => field.onChange(searchUser.id)}
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
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Permission Selector */}
              <FormField
                control={form.control}
                name="permission"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Permission Level</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="flex flex-col space-y-1"
                        data-testid="select-permission"
                      >
                        <div className="flex items-center space-x-3 space-y-0 rounded-md border p-4">
                          <RadioGroupItem value="editor" id="editor" data-testid="radio-permission-editor" />
                          <div className="flex-1">
                            <Label
                              htmlFor="editor"
                              className="font-medium cursor-pointer"
                            >
                              Editor
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Can add, remove, and edit items in the list
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3 space-y-0 rounded-md border p-4">
                          <RadioGroupItem value="viewer" id="viewer" data-testid="radio-permission-viewer" />
                          <div className="flex-1">
                            <Label
                              htmlFor="viewer"
                              className="font-medium cursor-pointer"
                            >
                              Viewer
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              Can only view the list and its items
                            </p>
                          </div>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  form.reset();
                  setSearchQuery("");
                  onOpenChange(false);
                }}
                disabled={inviteMutation.isPending}
                data-testid="button-cancel-invite"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!selectedUserId || inviteMutation.isPending}
                data-testid="button-send-invite"
              >
                {inviteMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send Invite"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
