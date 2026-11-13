"""Persistent local practice opponent; newline JSON over Vite's private child pipes."""
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "nnue/src"))
import chess
import chess.variant
import numpy as np
import torch
from behavior_audit import training_exposure
from native_player import WORKSPACE
from opening_index.source import position_fen,position_key
from predict_native_player import load_player,predict_native


def position(request):
    board=chess.variant.AtomicBoard(request['rootFen'])
    moves=request.get('moves',[])
    if not isinstance(moves,list) or len(moves)>1200:raise ValueError('Invalid move history')
    for san in moves:board.push_san(re.sub(r'[!?]+$','',san))
    expected=chess.variant.AtomicBoard(request['fen'])
    if position_fen(board)!=position_fen(expected):raise ValueError('Position and move history do not match')
    return board


def main():
    torch.set_num_threads(2);model=None;exposure=None;rng=np.random.default_rng()
    for line in sys.stdin:
        request={}
        try:
            request=json.loads(line)
            if not isinstance(request,dict):raise ValueError('Invalid opponent request')
            board=position(request)
            if model is None:
                model,_=load_player(WORKSPACE/'runs/rechesster/native-player-v1/best.pt',device='cpu')
                exposure=training_exposure()
            clock=request.get('clockMs');control=request.get('timeControl',[180,0])
            if clock is not None and (not isinstance(clock,(int,float)) or not 0<=clock<=10800000):raise ValueError('Invalid clock')
            if not isinstance(control,list) or len(control)!=2 or any(not isinstance(n,(int,float)) or not 0<=n<=10800 for n in control):raise ValueError('Invalid time control')
            now=time.time()*1000
            inputs={'fen':board.fen(en_passant='legal'),'played_at':now,'time_control':control,
                'clock_before_ms':clock,'recent_moves':[m.uci() for m in board.move_stack[-8:]],
                **exposure.features(position_key('atomic',position_fen(board)),now)}
            choices=predict_native(model,inputs)
            excluded=set(request.get('exclude',[]))
            choices=[m for m in choices if m['move'] not in excluded] or choices
            if choices:
                probabilities=np.array([m['probability'] for m in choices]);probabilities/=probabilities.sum()
                move=choices[rng.choice(len(choices),p=probabilities)]['move']
            else:move=None
            response={'id':request.get('id'),'fen':request['fen'],'move':move}
        except Exception as error:
            response={'id':request.get('id') if isinstance(request,dict) else None,'error':str(error)}
        print(json.dumps(response),flush=True)

if __name__=='__main__':main()
