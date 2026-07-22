'use client';

export default function MetaEmbeddedSignupPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground">
      <div className="mx-auto max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <p className="text-lg font-semibold">WhatsApp connection in progress</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Meta is completing the authorization. You can return to the WA Notifier clients page.
        </p>
      </div>
    </main>
  );
}
