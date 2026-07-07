import { DECK_SIZE } from '@op/shared';

export default function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-slate-100">
      <h1 className="text-3xl font-semibold tracking-tight">OPTCG Deck-builder</h1>
      <p className="text-slate-400">
        Phase 0 — fondations en place. Le deck-builder ({DECK_SIZE} cartes + leader) arrive en Phase
        1.
      </p>
      <footer className="fixed bottom-4 max-w-xl px-4 text-center text-xs text-slate-500">
        Projet fan-made, non affilié à Bandai. One Piece Card Game © Eiichiro Oda / Shueisha / Toei
        Animation / Bandai. Gratuit, non commercial, sans publicité.
      </footer>
    </main>
  );
}
