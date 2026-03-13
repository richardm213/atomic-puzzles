import { useMemo, useState } from 'react'
import Chessboard from './Chessboard'

const sampleFens = {
  start: 'start',
  italian: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
  puzzle: 'r2q2k1/1p6/p2p4/2pN1rp1/N1Pb2Q1/8/PP1B4/R6K b - - 2 25',
}

export default function App() {
  const [fenKey, setFenKey] = useState('start')
  const [orientation, setOrientation] = useState('white')
  const [coordinates, setCoordinates] = useState(true)

  const fen = useMemo(() => sampleFens[fenKey], [fenKey])

  return (
    <div className="page">
      <div className="panel">
        <h1>Chessground Starter</h1>
        <p>
          This starter keeps Chessground as the board UI only. You can swap FENs,
          flip orientation, and use this as the base for chess.js or your own move logic.
        </p>

        <div className="controls">
          <label>
            Position
            <select value={fenKey} onChange={e => setFenKey(e.target.value)}>
              <option value="start">Start</option>
              <option value="italian">Italian</option>
              <option value="puzzle">Puzzle</option>
            </select>
          </label>

          <label>
            Orientation
            <select value={orientation} onChange={e => setOrientation(e.target.value)}>
              <option value="white">White</option>
              <option value="black">Black</option>
            </select>
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={coordinates}
              onChange={e => setCoordinates(e.target.checked)}
            />
            Coordinates
          </label>
        </div>

        <div className="fenBox">
          <div className="fenLabel">Current FEN</div>
          <code>{fen}</code>
        </div>
      </div>

      <div className="boardWrap">
        <Chessboard
          fen={fen}
          orientation={orientation}
          coordinates={coordinates}
        />
      </div>
    </div>
  )
}
