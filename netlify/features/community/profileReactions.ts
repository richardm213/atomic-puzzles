import { isImagePlayerFlair } from "../../../shared/domain/playerSocial";
import { HttpError } from "../../platform/errors";

let nativeReactions: Promise<Set<string>> | undefined;

export const validateProfileReaction = async (reaction: string) => {
  if (isImagePlayerFlair(reaction)) return reaction;

  nativeReactions ??= import("emojibase-data/en/compact.json").then(
    ({ default: entries }) =>
      new Set(
        entries.flatMap(({ unicode, skins }) => [
          unicode,
          ...(skins ?? []).map((skin) => skin.unicode),
        ]),
      ),
  );
  if (!(await nativeReactions).has(reaction))
    throw new HttpError(400, "Choose an available emoji.");
  return reaction;
};
