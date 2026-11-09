import { BookOpenText, FileSearch, Lock, Quote } from "lucide-react";
import type { ReactNode } from "react";

const points = [
  { icon: FileSearch, title: "Answers from your documents", text: "Handbooks, policies and runbooks — searched in seconds." },
  { icon: Quote, title: "Every answer is cited", text: "See exactly which document and section an answer came from." },
  { icon: Lock, title: "Access-aware", text: "Restricted documents are only ever searched for administrators." },
];

export function AuthLayout({ children, note }: { children: ReactNode; note?: string }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between border-r bg-muted/40 p-10 lg:flex">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BookOpenText className="size-4" aria-hidden />
          </span>
          <span className="font-semibold tracking-tight">Knowledge Assistant</span>
        </div>
        <div className="max-w-md space-y-8">
          <h1 className="text-3xl font-semibold tracking-tight">Find answers in company knowledge, with sources you can check.</h1>
          <ul className="space-y-5">
            {points.map((p) => (
              <li key={p.title} className="flex gap-3">
                <p.icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                <div>
                  <p className="text-sm font-medium">{p.title}</p>
                  <p className="text-sm text-muted-foreground">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">Internal use only.</p>
      </section>
      <section className="flex flex-col items-center justify-center gap-4 p-6">
        {children}
        {note && <p className="max-w-sm text-center text-xs text-muted-foreground">{note}</p>}
      </section>
    </div>
  );
}
