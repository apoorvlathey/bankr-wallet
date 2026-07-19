import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type UIEvent,
} from "react";

type ScrollbarMetrics = {
  visible: boolean;
  thumbHeight: number;
  thumbOffset: number;
};

const EMPTY_METRICS: ScrollbarMetrics = {
  visible: false,
  thumbHeight: 0,
  thumbOffset: 0,
};

export function usePersistentScrollbar(contentVersion: number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState(EMPTY_METRICS);

  const measure = useCallback((element: HTMLDivElement | null) => {
    if (!element || element.scrollHeight <= element.clientHeight + 1) {
      setMetrics(EMPTY_METRICS);
      return;
    }
    const thumbHeight = Math.max(
      36,
      (element.clientHeight / element.scrollHeight) * element.clientHeight,
    );
    const thumbOffset =
      (element.scrollTop / (element.scrollHeight - element.clientHeight)) *
      (element.clientHeight - thumbHeight);
    setMetrics({ visible: true, thumbHeight, thumbOffset });
  }, []);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const update = () => measure(element);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [contentVersion, measure]);

  const onScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => measure(event.currentTarget),
    [measure],
  );

  return { scrollRef, metrics, onScroll };
}
