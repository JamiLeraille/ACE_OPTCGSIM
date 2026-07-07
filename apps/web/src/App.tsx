import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import { BuilderPage } from './pages/BuilderPage';
import { DeckPage } from './pages/DeckPage';
import { OnlinePage } from './pages/OnlinePage';
import { PlayPage } from './pages/PlayPage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
          <div className="flex items-center gap-5">
            <Link to="/" className="text-lg font-bold tracking-tight text-white">
              OP <span className="text-sky-500">Sim</span>
            </Link>
            <nav className="flex gap-3 text-sm">
              <NavLink
                to="/"
                className={({ isActive }) =>
                  isActive ? 'font-semibold text-sky-400' : 'text-slate-400 hover:text-slate-200'
                }
              >
                Deck-builder
              </NavLink>
              <NavLink
                to="/play"
                className={({ isActive }) =>
                  isActive ? 'font-semibold text-sky-400' : 'text-slate-400 hover:text-slate-200'
                }
              >
                Jouer (hotseat)
              </NavLink>
              <NavLink
                to="/online"
                className={({ isActive }) =>
                  isActive ? 'font-semibold text-sky-400' : 'text-slate-400 hover:text-slate-200'
                }
              >
                Jouer en ligne
              </NavLink>
            </nav>
          </div>
          <p className="hidden text-[11px] text-slate-600 md:block">
            Fan-made, non affilié à Bandai · One Piece Card Game © Eiichiro Oda / Shueisha / Toei
            Animation / Bandai · gratuit, sans publicité
          </p>
        </header>
        <main className="min-h-0 flex-1 p-4">
          <Routes>
            <Route path="/" element={<BuilderPage />} />
            <Route path="/deck/:id" element={<DeckPage />} />
            <Route path="/play" element={<PlayPage />} />
            <Route path="/online" element={<OnlinePage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
