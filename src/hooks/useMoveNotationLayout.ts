import { z } from "zod";

import { usePersistedState } from "./usePersistedState";

const schema = z.enum(["inline", "non-inline"]);
export const useMoveNotationLayout = () =>
  usePersistedState("atomic-puzzles.analysis.notation-layout", schema, "inline");
