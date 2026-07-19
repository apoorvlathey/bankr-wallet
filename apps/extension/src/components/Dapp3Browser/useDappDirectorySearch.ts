import { useEffect, useRef, useState } from "react";
import type { BrowserDappDirectoryResult } from "@/chrome/ensBrowsing/dappDirectorySearch";

interface DirectorySearchResponse {
  ok?: boolean;
  results?: BrowserDappDirectoryResult[];
}

export function useDappDirectorySearch(query: string) {
  const [results, setResults] = useState<BrowserDappDirectoryResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    const requestVersion = ++requestVersionRef.current;
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setFailed(false);
      return;
    }

    setLoading(true);
    setFailed(false);
    const timer = window.setTimeout(() => {
      void chrome.runtime
        .sendMessage({ type: "ens-search-dapp-directory", query: trimmed })
        .then((response: DirectorySearchResponse) => {
          if (requestVersion !== requestVersionRef.current) return;
          if (!response?.ok || !Array.isArray(response.results)) {
            setResults([]);
            setFailed(true);
            return;
          }
          setResults(response.results);
        })
        .catch(() => {
          if (requestVersion !== requestVersionRef.current) return;
          setResults([]);
          setFailed(true);
        })
        .finally(() => {
          if (requestVersion === requestVersionRef.current) setLoading(false);
        });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(
    () => () => {
      requestVersionRef.current += 1;
    },
    [],
  );

  return { results, loading, failed };
}
