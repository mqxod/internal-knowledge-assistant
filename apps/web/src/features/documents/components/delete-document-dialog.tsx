"use client";

import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { errorMessage } from "@/lib/api-client";
import { useDeleteDocument } from "../hooks/use-documents";

export function DeleteDocumentDialog({
  document,
  onOpenChange,
  onDeleted,
}: {
  document: { id: string; title: string } | null;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) {
  const del = useDeleteDocument();
  return (
    <AlertDialog open={!!document} onOpenChange={(o) => !del.isPending && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{document?.title}”?</AlertDialogTitle>
          <AlertDialogDescription>
            The document and all of its indexed sections will be permanently removed. The assistant will no longer use it to answer questions.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={del.isPending}
            onClick={(e) => {
              e.preventDefault();
              if (!document) return;
              del.mutate(document.id, {
                onSuccess: () => {
                  toast.success("Document deleted");
                  onOpenChange(false);
                  onDeleted?.();
                },
                onError: (err) => toast.error(errorMessage(err)),
              });
            }}
          >
            {del.isPending && <Loader2 className="animate-spin" />} Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
