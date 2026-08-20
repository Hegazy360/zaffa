import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";

interface LegalPageProps {
  eyebrow: string;
  title: string;
  updated: string;
  children: React.ReactNode;
}

/**
 * Shared chrome for legal / informational pages (privacy, terms, contact).
 * Keeps spacing and typography consistent without each page having to
 * re-import navbar/footer scaffolding.
 */
export function LegalPage({ eyebrow, title, updated, children }: LegalPageProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
          <header className="mb-10 border-b border-brand-line pb-6">
            <p className="mb-2 text-eyebrow font-medium text-rose-700/80">
              {eyebrow}
            </p>
            <h1 className="font-display text-4xl font-light tracking-tight sm:text-5xl">
              {title}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">{updated}</p>
          </header>
          <div className="prose prose-zinc max-w-none prose-headings:font-display prose-headings:font-light prose-headings:tracking-tight prose-h2:mt-10 prose-h2:text-2xl prose-h2:text-rose-900 prose-p:text-foreground/85 prose-a:text-rose-700 prose-a:no-underline hover:prose-a:underline">
            {children}
          </div>
        </article>
      </main>
      <Footer />
    </div>
  );
}
