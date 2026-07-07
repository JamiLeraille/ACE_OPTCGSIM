import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { BuilderPage } from './pages/BuilderPage';
import { DeckPage } from './pages/DeckPage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
          <Link to="/" className="text-lg font-bold tracking-tight text-white">
            OP <span className="text-sky-500">Deck-builder</span>
          </Link>
          <p className="hidden text-[11px] text-slate-600 sm:block">
            Fan-made, non affilié à Bandai · One Piece Card Game © Eiichiro Oda / Shueisha / Toei
            Animation / Bandai · gratuit, sans publicité
          </p>
        </header>
        <main className="min-h-0 flex-1 p-4">
          <Routes>
            <Route path="/" element={<BuilderPage />} />
            <Route path="/deck/:id" element={<DeckPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
