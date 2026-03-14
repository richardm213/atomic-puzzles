# Atomic Puzzle Trainer

A React + Vite application for training **atomic chess** tactics from a local puzzle dataset.

This project loads atomic chess positions from a JSON file, renders an interactive board, and lets you play through candidate lines with move history navigation.

## Features

- Load random atomic puzzles from `/private/puzzles.json`.
- Filter puzzle data to entries with valid FENs.
- Interactive board powered by `@lichess-org/chessground`.
- Atomic chess rules and legality handling via `chessops`.
- Auto board orientation based on side to move in the FEN.
- Move-line tracking with keyboard navigation:
  - `←` step backward through played moves
  - `→` step forward through played moves
- Quick link to analyze the current FEN on Lichess.

## Tech Stack

- [React 18](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [@lichess-org/chessground](https://www.npmjs.com/package/@lichess-org/chessground)
- [chessops](https://github.com/niklasf/chessops)
- ESLint + Prettier

## Getting Started

### Prerequisites

- Node.js 18+ (recommended)
- npm

### Installation

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

Then open the local URL printed by Vite (usually `http://localhost:5173`).

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Puzzle Data Format

The app expects puzzle data at:

```text
/public/private/puzzles.json
```

Expected structure:

```json
[
  {
    "id": "puzzle-001",
    "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  }
]
```

Notes:

- The root value must be an array.
- Each puzzle must include a valid atomic-compatible `fen` string.

## Controls

- **Prev / Next**: Navigate puzzle history.
- **Analyze**: Open the current FEN in Lichess analysis.
- **Drag pieces**: Play legal atomic moves.
- **Keyboard**:
  - `ArrowLeft` = previous move
  - `ArrowRight` = next move

## Available Scripts

- `npm run dev` – start dev server
- `npm run build` – create production build
- `npm run preview` – preview production build
- `npm run lint` – run ESLint
- `npm run lint:fix` – auto-fix lint issues
- `npm run format` – check formatting
- `npm run format:write` – format files

## Project Structure

```text
.
├── src/
│   ├── App.jsx            # App shell, puzzle loading, controls, status panels
│   ├── Chessboard.jsx     # Chessground + atomic move handling + move navigation
│   ├── main.jsx           # React entry point
│   ├── index.css          # App styles
│   └── theme/             # Chessground theme CSS
├── public/
│   └── private/puzzles.json  # Local puzzle dataset (expected)
└── vite.config.js
```

## License

No license file is currently included in this repository.
