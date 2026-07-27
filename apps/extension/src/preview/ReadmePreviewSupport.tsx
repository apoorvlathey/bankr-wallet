import { useEffect, useRef, useState } from "react";
import { Image } from "@chakra-ui/react";

export function AutoSelectFeePayment({ symbol }: { symbol: "USDC" }) {
  const phase = useRef<"open" | "select" | "settle" | "done">("open");
  const [done, setDone] = useState(false);
  useEffect(() => {
    let attempts = 0;
    const timer = window.setInterval(() => {
      if (phase.current === "done" || attempts >= 50) {
        window.clearInterval(timer);
        return;
      }
      attempts += 1;

      if (phase.current === "open") {
        const selector = Array.from(document.querySelectorAll("button")).find(
          (button) => {
            const row = button.parentElement?.parentElement;
            return (
              row?.textContent?.includes("Pay network fee with") &&
              button.textContent?.trim() === "ETH"
            );
          },
        );
        if (!selector) return;
        selector.click();
        phase.current = "select";
        return;
      }

      if (phase.current === "select") {
        const option = Array.from(document.querySelectorAll("button")).find(
          (button) => {
            const text = button.textContent?.trim() ?? "";
            return text.startsWith(symbol) && text.includes("Balance");
          },
        );
        if (!option) return;
        option.click();
        phase.current = "settle";
        return;
      }

      if (phase.current === "settle") {
        const bodyText = document.body.innerText;
        const quoteReady = bodyText.includes(`Maximum fee: 0.12 ${symbol}`);
        const sheetClosed = !bodyText.includes(
          "Choose the asset used only for this transaction's network fee.",
        );
        if (!quoteReady || !sheetClosed) return;
        phase.current = "done";
        setDone(true);
        window.clearInterval(timer);
      }
    }, 100);

    return () => window.clearInterval(timer);
  }, [symbol]);

  return done ? null : <span data-preview-automation-pending hidden />;
}

export function ReadmeBatchIdentityIcon({ src }: { src?: string }) {
  return (
    <Image
      src={src}
      alt=""
      boxSize="22px"
      objectFit="contain"
    />
  );
}
