/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_LB_TABLE?: string;
  readonly VITE_SUPABASE_PUZZLES_TABLE?: string;
  readonly VITE_SUPABASE_USERS_TABLE?: string;
  readonly VITE_SUPABASE_PUZZLE_PROGRESS_RPC?: string;
  readonly VITE_SUPABASE_PUZZLE_PROGRESS_TABLE?: string;
  readonly VITE_SUPABASE_PUZZLE_PROGRESS_PAGE_RPC?: string;
  readonly VITE_SUPABASE_ATTEMPTED_PUZZLE_IDS_RPC?: string;
  readonly VITE_LICHESS_CLIENT_ID?: string;
  readonly VITE_LICHESS_OAUTH_SCOPE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Chessground renders custom elements `<square>` and `<piece>` inside the board.
// Declaring them here keeps JSX type-safe when we render promotion overlays.
declare namespace JSX {
  interface IntrinsicElements {
    square: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    piece: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
  }
}
