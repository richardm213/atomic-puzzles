import { removeBrowserStorageItem } from "../../utils/browserStorage";

export const BOARD_SIZE_PROPERTY = "--board-user-size";
export const LEGACY_BOARD_SIZE_KEY = "atomic-puzzles.analysis.board-size";
export const boardSizeKey = (layout: HTMLElement) =>
  `atomic-puzzles.board-size.${layout.dataset.boardResize}`;

export const resetBoardSize = (layout: HTMLElement) => {
  layout.style.removeProperty(BOARD_SIZE_PROPERTY);
  removeBrowserStorageItem("local", boardSizeKey(layout));
  if (layout.dataset.boardResize === "analysis" || layout.dataset.boardResize === "game") {
    removeBrowserStorageItem("local", LEGACY_BOARD_SIZE_KEY);
  }
  document.body.dispatchEvent(new Event("chessground.resize"));
};

export const resetVisibleBoardSizes = () => {
  document.querySelectorAll<HTMLElement>("[data-board-resize]").forEach(resetBoardSize);
};
