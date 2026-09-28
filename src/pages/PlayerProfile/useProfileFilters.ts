import { useEffect, useReducer } from "react";

import type { SourceFilters } from "../../constants/matches";
import {
  createDefaultProfileFilters,
  type ProfileFilters,
} from "../../features/profile/profileFilters";
import { writeStoredSourceFilters } from "../../lib/matches/sourceFilterStorage";

type ProfileFilterDraftKey = Exclude<keyof ProfileFilters, "sourceFilters">;

type ProfileFilterState = {
  open: boolean;
  page: number;
  pageSize: number;
  draft: ProfileFilters;
  applied: ProfileFilters;
};

type ProfileFilterAction =
  | { type: "reset"; filters: ProfileFilters }
  | { type: "toggle" }
  | { type: "page"; page: number }
  | { type: "pageSize"; pageSize: number }
  | { type: "draft"; key: ProfileFilterDraftKey; value: string | number }
  | { type: "source"; source: keyof SourceFilters; checked: boolean }
  | { type: "apply" }
  | { type: "resetTimeControl"; filters: ProfileFilters };

const createState = (): ProfileFilterState => {
  const filters = createDefaultProfileFilters();
  return { open: false, page: 1, pageSize: 25, draft: filters, applied: filters };
};

const reducer = (state: ProfileFilterState, action: ProfileFilterAction): ProfileFilterState => {
  switch (action.type) {
    case "reset":
      return { ...state, open: false, page: 1, draft: action.filters, applied: action.filters };
    case "toggle":
      return { ...state, open: !state.open };
    case "page":
      return { ...state, page: action.page };
    case "pageSize":
      return { ...state, page: 1, pageSize: action.pageSize };
    case "draft":
      return { ...state, draft: { ...state.draft, [action.key]: action.value } };
    case "source": {
      const sourceFilters = { ...state.draft.sourceFilters, [action.source]: action.checked };
      writeStoredSourceFilters(sourceFilters);
      return { ...state, draft: { ...state.draft, sourceFilters } };
    }
    case "apply":
      return {
        ...state,
        page: 1,
        applied: { ...state.draft, sourceFilters: { ...state.draft.sourceFilters } },
      };
    case "resetTimeControl":
      return {
        ...state,
        page: 1,
        draft: {
          ...state.draft,
          timeControlInitialFilter: action.filters.timeControlInitialFilter,
          timeControlIncrementFilter: action.filters.timeControlIncrementFilter,
        },
        applied: {
          ...state.applied,
          timeControlInitialFilter: action.filters.timeControlInitialFilter,
          timeControlIncrementFilter: action.filters.timeControlIncrementFilter,
        },
      };
  }
};

export const useProfileFilters = (resetKey: string) => {
  const [state, dispatch] = useReducer(reducer, undefined, createState);

  useEffect(() => {
    dispatch({ type: "reset", filters: createDefaultProfileFilters() });
  }, [resetKey]);

  return {
    matchFiltersOpen: state.open,
    toggleMatchFilters: () => dispatch({ type: "toggle" }),
    page: state.page,
    setPage: (page: number) => dispatch({ type: "page", page }),
    pageSize: state.pageSize,
    setPageSize: (pageSize: number) => dispatch({ type: "pageSize", pageSize }),
    appliedFilters: state.applied,
    applyFilters: () => dispatch({ type: "apply" }),
    resetTimeControl: () =>
      dispatch({ type: "resetTimeControl", filters: createDefaultProfileFilters() }),
    opponentRatingMin: state.draft.opponentRatingMin,
    setOpponentRatingMin: (value: number) =>
      dispatch({ type: "draft", key: "opponentRatingMin", value }),
    opponentRatingMax: state.draft.opponentRatingMax,
    setOpponentRatingMax: (value: number) =>
      dispatch({ type: "draft", key: "opponentRatingMax", value }),
    opponentFilter: state.draft.opponentFilter,
    setOpponentFilter: (value: string) => dispatch({ type: "draft", key: "opponentFilter", value }),
    startDateFilter: state.draft.startDateFilter,
    setStartDateFilter: (value: string) =>
      dispatch({ type: "draft", key: "startDateFilter", value }),
    endDateFilter: state.draft.endDateFilter,
    setEndDateFilter: (value: string) => dispatch({ type: "draft", key: "endDateFilter", value }),
    sourceFilters: state.draft.sourceFilters,
    setSourceFilter: (source: keyof SourceFilters, checked: boolean) =>
      dispatch({ type: "source", source, checked }),
    timeControlInitialFilter: state.draft.timeControlInitialFilter,
    setTimeControlInitialFilter: (value: string) =>
      dispatch({ type: "draft", key: "timeControlInitialFilter", value }),
    timeControlIncrementFilter: state.draft.timeControlIncrementFilter,
    setTimeControlIncrementFilter: (value: string) =>
      dispatch({ type: "draft", key: "timeControlIncrementFilter", value }),
  };
};
