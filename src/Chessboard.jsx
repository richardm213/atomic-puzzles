import { useEffect, useRef } from "react";
import { Chessground } from "@lichess-org/chessground";

export default function Chessboard({ fen, orientation, coordinates }) {
  const elementRef = useRef(null);
  const cgRef = useRef(null);

  useEffect(() => {
    if (!elementRef.current) return;

    cgRef.current = Chessground(elementRef.current, {
      fen,
      orientation,
      coordinates,
      movable: {
        free: true,
        color: "both",
      },
      draggable: {
        enabled: true,
      },
      selectable: {
        enabled: true,
      },
    });

    return () => {
      cgRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!cgRef.current) return;

    cgRef.current.set({
      fen,
      orientation,
      coordinates,
    });
  }, [fen, orientation, coordinates]);

  return <div ref={elementRef} className="cg-board" />;
}
