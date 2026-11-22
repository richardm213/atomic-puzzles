"""Check sampled strong-policy moves against immediate Atomic capture threats."""
import atexit
from pathlib import Path

import chess
import chess.engine


PIECE_VALUES = {chess.PAWN: 1, chess.KNIGHT: 3, chess.BISHOP: 3, chess.ROOK: 5, chess.QUEEN: 9}
ENGINE_LIMIT = chess.engine.Limit(nodes=65_536, time=0.35)
MIN_RATING = 2000
MIN_SEARCH_LOSS = 500


def material(board, color):
    return sum(value * len(board.pieces(piece, color)) for piece, value in PIECE_VALUES.items())


def allows_tactical_loss(board, move):
    """Detect legal replies that win material with a piece loss or explode the king."""
    us = board.turn
    child = board.copy(stack=False)
    child.push(move)
    if child.is_variant_end():
        return False
    pieces = (child.occupied_co[us] & ~child.pawns).bit_count()
    before = material(child, us) - material(child, not us)
    for reply in child.generate_legal_captures():
        child.push(reply)
        loses_king = child.king(us) is None
        loses_material = ((child.occupied_co[us] & ~child.pawns).bit_count() < pieces
                          and material(child, us) - material(child, not us) < before)
        child.pop()
        if loses_king or loses_material:
            return True
    return False


class TacticalCheck:
    def __init__(self, network):
        self.network = Path(network)
        self.engine = None
        atexit.register(self.close)

    def close(self):
        if self.engine is not None:
            self.engine.close()
            self.engine = None

    def safer_move(self, board, uci, available):
        move = board.parse_uci(uci)
        if len(available) < 2 or not allows_tactical_loss(board, move):
            return uci
        try:
            if self.engine is None:
                self.engine = chess.engine.SimpleEngine.popen_uci(
                    str(self.network.with_name('atomic-stockfish')), timeout=3)
                self.engine.configure({'Threads': 1, 'Hash': 16, 'Use NNUE': 'pure',
                                       'EvalFile': str(self.network)})
            self.engine.configure({'Clear Hash': None})
            alternatives = None if len(available) == board.legal_moves.count() else [
                board.parse_uci(choice) for choice in available]
            best = self.engine.analyse(board, ENGINE_LIMIT, root_moves=alternatives)
            best_move = best['pv'][0]
            if best_move == move:
                return uci
            self.engine.configure({'Clear Hash': None})
            played = self.engine.analyse(board, ENGINE_LIMIT, root_moves=[move])
        except (OSError, TimeoutError, chess.engine.EngineError, KeyError, IndexError):
            self.close()
            return uci

        best_score = best['score'].pov(board.turn)
        played_score = played['score'].pov(board.turn)
        if (played_score.mate() or 0) > 0:
            return uci
        if best_score.score(mate_score=20_000) - played_score.score(mate_score=20_000) >= MIN_SEARCH_LOSS:
            return best_move.uci()
        return uci
