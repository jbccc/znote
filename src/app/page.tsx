import { auth, signIn, signOut } from "@/auth";
import { NoteEditor } from "@/components/note-editor";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function Home() {
  const session = await auth();

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-3xl mx-auto">
      <header className="flex justify-between items-center mb-8 text-xs text-foreground/40">
        <span>znote</span>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          {session ? (
            <form
              action={async () => {
                "use server";
                await signOut();
              }}
            >
              <button className="hover:text-foreground transition-colors">
                sign out
              </button>
            </form>
          ) : (
            <form
              action={async () => {
                "use server";
                await signIn("google");
              }}
            >
              <button className="hover:text-foreground transition-colors">
                sign in to save
              </button>
            </form>
          )}
        </div>
      </header>
      <NoteEditor isLoggedIn={!!session} />
    </main>
  );
}
