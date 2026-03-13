import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function TruncatedText({
  text,
  className
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const updateTruncation = () => {
      setIsTruncated(element.scrollWidth > element.clientWidth);
    };

    updateTruncation();

    const observer = new ResizeObserver(() => {
      updateTruncation();
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [text]);

  return (
    <span
      ref={ref}
      className={cn("truncate", className)}
      title={isTruncated ? text : undefined}
    >
      {text}
    </span>
  );
}
