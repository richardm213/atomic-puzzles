"""Regressions for the strong local Atomic opponent's tactical check."""
from pathlib import Path
import unittest

import chess.variant

from practice_tactics import TacticalCheck, allows_tactical_loss


NETWORK = (Path(__file__).resolve().parents[1]
           / 'nnue/engine/Atomic-Stockfish/src/atomic-ft3b-1p2B.nnue')


@unittest.skipUnless(NETWORK.is_file() and NETWORK.with_name('atomic-stockfish').is_file(),
                     'Requires the local Atomic Stockfish build and network')
class PracticeTacticsTests(unittest.TestCase):
    def setUp(self):
        self.check = TacticalCheck(NETWORK)
        self.addCleanup(self.check.close)

    def test_collateral_queen_loss_is_replaced(self):
        board = chess.variant.AtomicBoard('rnbqkb1r/p1pp2pp/8/1p2pp2/3N1PQ1/4P2P/PPPP2P1/RNB1KB2 w Qkq - 0 8')
        move = board.parse_san('Qg5')
        self.assertTrue(allows_tactical_loss(board, move))
        choices = [candidate.uci() for candidate in board.legal_moves]
        replacement = board.parse_uci(self.check.safer_move(board, move.uci(), choices))
        self.assertNotEqual(replacement, move)
        board.push(replacement)
        reply = chess.Move.from_uci('e5f4')
        if board.is_legal(reply):
            board.push(reply)
            self.assertTrue(board.pieces(chess.QUEEN, chess.WHITE))

    def test_forcing_continuation_can_give_away_material(self):
        board = chess.variant.AtomicBoard('rnb1kbnr/pp1pp2p/5pp1/7Q/qP1PP3/7N/P1P2PPP/R1B1KB1R w KQkq - 0 8')
        move = board.parse_san('Bb5')
        self.assertTrue(allows_tactical_loss(board, move))
        choices = [candidate.uci() for candidate in board.legal_moves]
        self.assertEqual(self.check.safer_move(board, move.uci(), choices), move.uci())


if __name__ == '__main__':
    unittest.main()
