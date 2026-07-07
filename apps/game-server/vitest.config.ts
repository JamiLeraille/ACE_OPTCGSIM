import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Le pool "forks" (défaut) crashe sur la sérialisation IPC avec les
    // transports WebSocket ; les threads fonctionnent.
    pool: 'threads',
  },
});
