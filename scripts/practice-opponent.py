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
from native_player import WORKSPACE
from opening_index.source import position_fen,position_key
from practice_tactics import MIN_RATING, TacticalCheck


def position(request):
    board=chess.variant.AtomicBoard(request['rootFen'])
    moves=request.get('moves',[])
    if not isinstance(moves,list) or len(moves)>1200:raise ValueError('Invalid move history')
    for san in moves:board.push_san(re.sub(r'[!?]+$','',san))
    expected=chess.variant.AtomicBoard(request['fen'])
    if position_fen(board)!=position_fen(expected):raise ValueError('Position and move history do not match')
    return board


def main():
    torch.set_num_threads(2);models={};exposure=None;rng=np.random.default_rng()
    tactical_check = None
    for line in sys.stdin:
        request={}
        try:
            request=json.loads(line)
            if not isinstance(request,dict):raise ValueError('Invalid opponent request')
            board=position(request)
            model_name=request.get('model','rechesster')
            if model_name not in {'rechesster','human'}:raise ValueError('Unknown local opponent')
            ratings=[]
            for key in ['rating','opponentRating']:
                value=request.get(key,2300 if key=='rating' else 2000)
                if isinstance(value,bool) or not isinstance(value,(int,float)) or not np.isfinite(value) or not 500<=value<=3000:
                    raise ValueError('Ratings must be between 500 and 3000')
                ratings.append(float(value))
            if model_name not in models:
                if model_name=='human':
                    from predict_general_human import load_general
                    models[model_name],_=load_general(WORKSPACE/'runs/general-human-v2/model/best.pt',device='cpu')
                else:
                    from predict_native_player import load_player
                    from behavior_audit import training_exposure
                    models[model_name],_=load_player(WORKSPACE/'runs/rechesster/native-player-v1/best.pt',device='cpu')
                    exposure=training_exposure()
            clock=request.get('clockMs');control=request.get('timeControl',[180,0])
            if clock is not None and (not isinstance(clock,(int,float)) or not 0<=clock<=10800000):raise ValueError('Invalid clock')
            if not isinstance(control,list) or len(control)!=2 or any(not isinstance(n,(int,float)) or not 0<=n<=10800 for n in control):raise ValueError('Invalid time control')
            if model_name=='human':
                from predict_general_human import predict
                choices=[{'move':c['uci'],'probability':c['probability']} for c in predict(
                    models[model_name],board.fen(en_passant='legal'),*ratings,time_control=control,clock_ms=clock,
                    recent_moves=[m.uci() for m in board.move_stack[-8:]])]
            else:
                from predict_native_player import predict_native
                now=time.time()*1000
                inputs={'fen':board.fen(en_passant='legal'),'played_at':now,'time_control':control,
                    'clock_before_ms':clock,'recent_moves':[m.uci() for m in board.move_stack[-8:]],
                    **exposure.features(position_key('atomic',position_fen(board)),now)}
                choices=predict_native(models[model_name],inputs)
            excluded=set(request.get('exclude',[]))
            choices=[m for m in choices if m['move'] not in excluded] or choices
            if choices:
                probabilities=np.array([m['probability'] for m in choices]);probabilities/=probabilities.sum()
                move=choices[rng.choice(len(choices),p=probabilities)]['move']
                if model_name == 'human' and ratings[0] >= MIN_RATING:
                    if tactical_check is None:
                        from general_stream import NETWORK
                        tactical_check = TacticalCheck(NETWORK)
                    move = tactical_check.safer_move(board, move, [choice['move'] for choice in choices])
            else:move=None
            response={'id':request.get('id'),'fen':request['fen'],'move':move}
        except Exception as error:
            response={'id':request.get('id') if isinstance(request,dict) else None,'error':str(error)}
        print(json.dumps(response),flush=True)

if __name__=='__main__':main()
