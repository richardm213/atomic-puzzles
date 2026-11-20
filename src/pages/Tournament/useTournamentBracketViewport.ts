import {
  type PointerEvent as ReactPointerEvent,
  type UIEvent as ReactUIEvent,
  useCallback,
  useRef,
  useState,
} from "react";
type DragState = {
  stageKey: string;
  pointerId: number;
  startX: number;
  startY: number;
  startScrollLeft: number;
  startScrollTop: number;
  moved: boolean;
};

const isInteractivePointerTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  if (target.closest(".tournamentMatchCardTree")) return false;

  return Boolean(
    target.closest("a, button, input, select, textarea, [role='button'], [role='link']"),
  );
};

export const useTournamentBracketViewport = () => {
  const [draggingStage, setDraggingStage] = useState<string>("");
  const dragStateRef = useRef<DragState | null>(null);
  const suppressNextMatchClickRef = useRef(false);
  const scrollerRefs = useRef<Record<string, HTMLDivElement>>({});
  const headerTrackRefs = useRef<Record<string, HTMLDivElement>>({});
  const setScrollerRef = (stageKey: string, node: HTMLDivElement | null): void => {
    if (node) {
      scrollerRefs.current[stageKey] = node;
      syncRoundHeaderTrack(stageKey, node.scrollLeft);
      return;
    }

    delete scrollerRefs.current[stageKey];
  };

  const syncRoundHeaderTrack = useCallback((stageKey: string, scrollLeft: number): void => {
    const headerTrack = headerTrackRefs.current[stageKey];
    if (!headerTrack) return;
    headerTrack.style.transform = `translate3d(${-scrollLeft}px, 0, 0)`;
  }, []);

  const setHeaderTrackRef = (stageKey: string, node: HTMLDivElement | null): void => {
    if (node) {
      headerTrackRefs.current[stageKey] = node;
      syncRoundHeaderTrack(stageKey, scrollerRefs.current[stageKey]?.scrollLeft || 0);
      return;
    }

    delete headerTrackRefs.current[stageKey];
  };

  const handleScrollerScroll = (stageKey: string, event: ReactUIEvent<HTMLDivElement>): void => {
    syncRoundHeaderTrack(stageKey, event.currentTarget.scrollLeft);
  };

  const shouldSuppressMatchClick = (): boolean => {
    if (!suppressNextMatchClickRef.current) return false;
    suppressNextMatchClickRef.current = false;
    return true;
  };

  const isPointerOnNativeScrollbar = (element: HTMLElement, event: ReactPointerEvent): boolean => {
    const rect = element.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const verticalScrollbarWidth = element.offsetWidth - element.clientWidth;
    const horizontalScrollbarHeight = element.offsetHeight - element.clientHeight;

    return (
      (verticalScrollbarWidth > 0 && localX >= element.clientWidth) ||
      (horizontalScrollbarHeight > 0 && localY >= element.clientHeight)
    );
  };

  const handleScrollerPointerDown = (
    stageKey: string,
    event: ReactPointerEvent<HTMLDivElement>,
  ): void => {
    // Touch scrolling is deliberately left to the browser so mobile gets native
    // momentum, gesture arbitration, and compositor-thread scrolling.
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    if (isInteractivePointerTarget(event.target)) return;
    if (isPointerOnNativeScrollbar(event.currentTarget, event)) return;

    const currentTarget = event.currentTarget;
    dragStateRef.current = {
      stageKey,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: currentTarget.scrollLeft,
      startScrollTop: currentTarget.scrollTop,
      moved: false,
    };
    setDraggingStage(stageKey);
  };

  const handleScrollerPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    if (!dragState.moved) {
      if (Math.abs(deltaX) <= 4 && Math.abs(deltaY) <= 4) return;
      dragState.moved = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    event.currentTarget.scrollLeft = dragState.startScrollLeft - deltaX;
    const targetScrollTop = dragState.startScrollTop - deltaY;
    const maxInternalScrollTop = Math.max(
      0,
      event.currentTarget.scrollHeight - event.currentTarget.clientHeight,
    );
    const clampedScrollTop = Math.min(maxInternalScrollTop, Math.max(0, targetScrollTop));
    event.currentTarget.scrollTop = clampedScrollTop;
  };

  const endScrollerDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    suppressNextMatchClickRef.current = dragState.moved;
    if (dragState.moved && typeof window !== "undefined") {
      window.setTimeout(() => {
        suppressNextMatchClickRef.current = false;
      }, 0);
    }
    dragStateRef.current = null;
    setDraggingStage("");
  };

  return {
    draggingStage,
    scrollerRefs,
    syncRoundHeaderTrack,
    setScrollerRef,
    setHeaderTrackRef,
    handleScrollerScroll,
    handleScrollerPointerDown,
    handleScrollerPointerMove,
    endScrollerDrag,
    shouldSuppressMatchClick,
  };
};
