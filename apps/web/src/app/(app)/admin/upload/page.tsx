import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { UploadForm } from "@/features/documents/components/upload-form";

export const metadata: Metadata = { title: "Upload document" };

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 lg:p-8">
      <PageHeader
        title="Upload document"
        description="Markdown and text files are split into sections by heading, so answers can cite the exact section they came from."
      />
      <UploadForm />
    </div>
  );
}
