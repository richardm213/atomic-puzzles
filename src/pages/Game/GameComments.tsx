import { z } from "zod";

import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { usePersistedState } from "../../hooks/usePersistedState";
import type { ArchiveGame } from "../../lib/archive/games";
import { useGameTournament } from "./useGameTournament";

export const GameComments = ({ game }: { game: ArchiveGame }) => {
  const [hideChat, setHideChat] = usePersistedState("game-hide-chat", z.boolean(), false);
  const { isTournament } = useGameTournament(game);
  if (!isTournament) return null;
  const messages = game.spectator_chat;
  return (
    <section className="gameComments" aria-label="Spectator chat">
      <header className="gameCommentsHeader">
        <h2>Chat</h2>
        <label>
          <input
            type="checkbox"
            checked={hideChat}
            onChange={(event) => setHideChat(event.target.checked)}
          />
          Hide chat
        </label>
      </header>
      {hideChat ? null : messages?.length ? (
        <ol className="gameCommentsMessages">
          {messages.map(({ username, text }, index) => (
            <li key={index}>
              <PlayerLink username={username}>{username}</PlayerLink> <span>{text}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="gameCommentsEmpty">
          {messages ? "No spectator chat." : "Spectator chat hasn’t been captured yet."}
        </p>
      )}
    </section>
  );
};
