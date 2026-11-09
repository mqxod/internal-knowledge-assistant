import { DocumentDetail } from "@/features/documents/components/document-detail";

export default async function DocumentDetailPage({ params }: PageProps<"/admin/documents/[id]">) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-8">
      <DocumentDetail id={id} />
    </div>
  );
}
