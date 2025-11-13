import { Badge } from "@/components/ui/badge";

interface CollaboratorPermissionBadgeProps {
  permission: "editor" | "viewer";
}

export function CollaboratorPermissionBadge({ permission }: CollaboratorPermissionBadgeProps) {
  return (
    <Badge 
      variant={permission === "editor" ? "default" : "secondary"}
      className={permission === "editor" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}
    >
      {permission === "editor" ? "Editor" : "Viewer"}
    </Badge>
  );
}
