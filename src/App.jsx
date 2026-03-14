import { useMemo, useState } from "react";
import Chessboard from "./Chessboard";

const sampleFens = {
  start: "rn1qkbnr/pppb1ppp/8/3pp3/8/3P1N2/PPPBPPPP/RN1QKB1R w KQkq - 0 1",
  standardStart: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  tactic: "r2q2k1/1p6/p2p4/2pN1rp1/N1Pb2Q1/8/PP1B4/R6K b - - 2 25",
};

export default function App() {
  const [fenKey, setFenKey] = useState("standardStart");
  const [orientation, setOrientation] = useState("white");
  const [coordinates, setCoordinates] = useState(true);
  const [boardState, setBoardState] = useState({
    fen: sampleFens.standardStart,
    turn: "white",
    status: "white to move",
    winner: undefined,
    error: "",
    line: "",
    lineIndex: 0,
  });

  const fen = useMemo(() => sampleFens[fenKey], [fenKey]);

  return (
    <div className="page">
      <div className="panel">
        <h1>Chessground + Atomic Chess</h1>
        <p>
          This starter uses Chessground for the board UI and chessops for Atomic
          rules. Moves are legal only when they are valid in Atomic chess.
        </p>

        <div className="controls">
          <label>
            Position
            <select value={fenKey} onChange={(e) => setFenKey(e.target.value)}>
              <option value="standardStart">Standard Start</option>
              <option value="start">Open Position</option>
              <option value="tactic">Atomic Tactic</option>
            </select>
          </label>

          <label>
            Orientation
            <select
              value={orientation}
              onChange={(e) => setOrientation(e.target.value)}
            >
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={coordinates}
              onChange={(e) => setCoordinates(e.target.checked)}
            />
            Coordinates
          </label>
        </div>

        <div className="statusBox">
          <div>
            <span className="statusLabel">Status</span>
            <strong>{boardState.status}</strong>
          </div>
          {boardState.error ? (
            <div className="errorText">{boardState.error}</div>
          ) : null}
        </div>

        <div className="fenBox">
          <div className="fenLabel">Current FEN</div>
          <code>{boardState.fen}</code>
        </div>

        <div className="lineBox">
          <div className="fenLabel">Move line (← / → to navigate)</div>
          <code>{boardState.line || "No moves yet"}</code>
        </div>
      </div>

      <div className="boardWrap">
        <Chessboard
          fen={fen}
          orientation={orientation}
          coordinates={coordinates}
          onStateChange={setBoardState}
        />
      </div>
    </div>
  );
}
