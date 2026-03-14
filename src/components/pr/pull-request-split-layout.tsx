import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from "react";

const FILE_TREE_WIDTH_STORAGE_KEY = "lgtmate-file-tree-width";
const DEFAULT_FILE_TREE_WIDTH = 352;
const MIN_FILE_TREE_WIDTH = 240;
const MIN_CONTENT_WIDTH = 480;
const RESIZE_HANDLE_WIDTH = 12;

function clampFileTreeWidth(width: number, containerWidth: number) {
  const maxWidth = Math.max(
    MIN_FILE_TREE_WIDTH,
    containerWidth - MIN_CONTENT_WIDTH - RESIZE_HANDLE_WIDTH
  );

  return Math.min(Math.max(width, MIN_FILE_TREE_WIDTH), maxWidth);
}

function getStoredFileTreeWidth() {
  if (typeof window === "undefined") {
    return DEFAULT_FILE_TREE_WIDTH;
  }

  const storedWidth = Number(window.localStorage.getItem(FILE_TREE_WIDTH_STORAGE_KEY));

  return Number.isFinite(storedWidth) && storedWidth >= MIN_FILE_TREE_WIDTH
    ? storedWidth
    : DEFAULT_FILE_TREE_WIDTH;
}

export function PullRequestSplitLayout({
  sidebar,
  content
}: {
  sidebar: ReactNode;
  content: ReactNode;
}) {
  const [fileTreeWidth, setFileTreeWidth] = useState(() => getStoredFileTreeWidth());
  const [isResizing, setIsResizing] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.localStorage.setItem(
      FILE_TREE_WIDTH_STORAGE_KEY,
      String(fileTreeWidth)
    );
  }, [fileTreeWidth]);

  useEffect(() => {
    const container = splitContainerRef.current;

    if (!container) {
      return;
    }

    const updateWidth = () => {
      const nextWidth = clampFileTreeWidth(
        fileTreeWidth,
        container.getBoundingClientRect().width
      );

      setFileTreeWidth((currentWidth) =>
        currentWidth === nextWidth ? currentWidth : nextWidth
      );
    };

    updateWidth();

    const observer = new ResizeObserver(() => {
      updateWidth();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [fileTreeWidth]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing]);

  function handleResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    const container = splitContainerRef.current;

    if (!container) {
      return;
    }

    const startX = event.clientX;
    const startWidth = fileTreeWidth;

    setIsResizing(true);

    const handlePointerMove = (pointerEvent: globalThis.PointerEvent) => {
      const containerWidth = container.getBoundingClientRect().width;
      const nextWidth = clampFileTreeWidth(
        startWidth + pointerEvent.clientX - startX,
        containerWidth
      );

      setFileTreeWidth(nextWidth);
    };

    const handlePointerUp = () => {
      setIsResizing(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function handleResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const container = splitContainerRef.current;

    if (!container) {
      return;
    }

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();

    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const nextWidth = clampFileTreeWidth(
      fileTreeWidth + direction * 24,
      container.getBoundingClientRect().width
    );

    setFileTreeWidth(nextWidth);
  }

  return (
    <div ref={splitContainerRef} className="flex min-h-0 flex-1">
      <aside
        className="min-h-0 shrink-0 overflow-hidden border-r border-border/70 bg-muted/25"
        style={{ width: `${fileTreeWidth}px` }}
      >
        {sidebar}
      </aside>
      <div
        role="separator"
        aria-label="Resize file list"
        aria-orientation="vertical"
        aria-valuemin={MIN_FILE_TREE_WIDTH}
        aria-valuemax={Math.max(
          MIN_FILE_TREE_WIDTH,
          (splitContainerRef.current?.getBoundingClientRect().width ?? 0) -
            MIN_CONTENT_WIDTH -
            RESIZE_HANDLE_WIDTH
        )}
        aria-valuenow={Math.round(fileTreeWidth)}
        tabIndex={0}
        className="group relative shrink-0 cursor-col-resize touch-none outline-none"
        style={{ width: `${RESIZE_HANDLE_WIDTH}px` }}
        onPointerDown={handleResizeStart}
        onKeyDown={handleResizeKeyDown}
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/80 group-hover:bg-foreground/40 group-focus-visible:bg-foreground/40" />
      </div>
      <section className="min-h-0 min-w-0 flex-1 overflow-auto">{content}</section>
    </div>
  );
}
