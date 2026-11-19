import { buildBoardStyle } from "../../components/Chessboard/boardStyle";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { useAppSettings } from "../../context/AppSettings";

export const PuzzleBoardPlaceholder = ({ loading }: { loading: boolean }) => {
  const settings = useAppSettings();
  const style = buildBoardStyle(
    settings.boardTheme,
    settings.customLightSquare,
    settings.customDarkSquare,
    settings.boardColorOverrideTheme,
    settings.boardOverrideLightSquare,
    settings.boardOverrideDarkSquare,
    settings.colorMode,
  );
  return (
    <div className="emptyBoard puzzleBoardPlaceholder" style={style} aria-busy={loading}>
      {loading ? <RouteLoadingFallback /> : null}
    </div>
  );
};
