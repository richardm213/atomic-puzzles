import { useCallback, useState } from "react";

import {
  addRecentUsername,
  loadRecentUsernames,
  removeRecentUsername,
  storeRecentUsernames,
} from "../utils/recentUsernames";

export const useUsernamePicker = <Target extends string>(initialTarget: Target) => {
  const [isOpen, setIsOpen] = useState(false);
  const [target, setTarget] = useState<Target>(initialTarget);
  const [recentUsernames, setRecentUsernames] = useState<string[]>(loadRecentUsernames);

  const saveRecentUsernames = useCallback((usernames: string[]): void => {
    setRecentUsernames(usernames);
    storeRecentUsernames(usernames);
  }, []);

  const open = useCallback((nextTarget?: Target): void => {
    if (nextTarget !== undefined) setTarget(nextTarget);
    setIsOpen(true);
  }, []);
  const close = useCallback((): void => setIsOpen(false), []);
  const remember = useCallback(
    (username: string): void => {
      saveRecentUsernames(addRecentUsername(recentUsernames, username));
    },
    [recentUsernames, saveRecentUsernames],
  );
  const removeRecent = useCallback(
    (username: string): void => {
      saveRecentUsernames(removeRecentUsername(recentUsernames, username));
    },
    [recentUsernames, saveRecentUsernames],
  );

  return { isOpen, target, recentUsernames, open, close, remember, removeRecent };
};
