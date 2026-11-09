import type { Metadata } from "next";
import Link from "next/link";
import { Upload } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { DocumentsTable } from "@/features/documents/components/documents-table";

export const metadata: Metadata = { title: "Documents" };

export default function DocumentsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Documents"
        description="Everything the assistant can search, with processing status and access level."
        actions={<Button asChild size="sm"><Link href="/admin/upload"><Upload /> Upload document</Link></Button>}
      />
      <DocumentsTable />
    </div>
  );
}
