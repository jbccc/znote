import { auth } from "@/auth";
import { NoteEditor } from "@/components/note-editor";
import { handleSignIn, handleSignOut } from "@/components/auth-actions";

export default async function Home() {
  const session = await auth();

  return (
    <main className="min-h-screen p-4 md:p-8 max-w-3xl mx-auto">
      <NoteEditor
        isLoggedIn={!!session}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />
    </main>
  );
}
