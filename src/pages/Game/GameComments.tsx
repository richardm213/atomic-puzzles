import { z } from "zod";

import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { usePersistedState } from "../../hooks/usePersistedState";
import { usePlayerDisplayNames } from "../../hooks/usePlayerDisplayNames";
import type { ArchiveGame } from "../../lib/archive/games";
import { useGameTournament } from "./useGameTournament";

export const GameComments = ({ game }: { game: ArchiveGame }) => {
  const [hideChat, setHideChat] = usePersistedState("game-hide-chat", z.boolean(), false);
  const { isTournament } = useGameTournament(game);
  const messages = game.spectator_chat;
  const showChat = isTournament || game.source === "pychess";
  const displayName = usePlayerDisplayNames(showChat && Boolean(messages?.length));
  if (!showChat) return null;
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
          {messages.map(({ username, text }, index) => {
            const author = displayName(username);
            return (
              <li key={index}>
                <PlayerLink username={author.username}>{author.label}</PlayerLink>
                <span> {text}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="gameCommentsEmpty">
          {messages ? "No spectator chat." : "Spectator chat hasn’t been captured yet."}
        </p>
      )}
    </section>
  );
};
