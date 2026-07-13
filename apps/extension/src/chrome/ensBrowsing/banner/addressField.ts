import { splitEnsDisplayUrl } from "./pageState";
import type { AddressField } from "./types";

function colorize(element: HTMLElement, text: string): void {
  element.textContent = "";
  if (!text) return;
  const { host, path } = splitEnsDisplayUrl(text);
  const hostSpan = document.createElement("span");
  hostSpan.className = "u-host";
  hostSpan.textContent = host;
  element.appendChild(hostSpan);
  if (path) {
    const pathSpan = document.createElement("span");
    pathSpan.className = "u-path";
    pathSpan.textContent = path;
    element.appendChild(pathSpan);
  }
}

export function setupAddressField(
  element: HTMLElement,
  options: {
    shadowRoot: ShadowRoot;
    placeholder?: string;
    onSubmit: (text: string) => void;
    onEscape?: () => void;
  },
): AddressField {
  element.setAttribute("contenteditable", "plaintext-only");
  element.setAttribute("spellcheck", "false");
  element.setAttribute("role", "textbox");
  element.setAttribute("aria-label", "Name address");
  if (options.placeholder) {
    element.setAttribute("data-placeholder", options.placeholder);
  }

  const getSelectionObject = (): Selection | null => {
    const root = options.shadowRoot as unknown as {
      getSelection?: () => Selection | null;
    };
    if (root.getSelection) return root.getSelection() ?? null;
    return window.getSelection();
  };
  const getText = () => element.textContent ?? "";
  const getCaretOffset = (): number | null => {
    const selection = getSelectionObject();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!element.contains(range.endContainer)) return null;
    const prefix = range.cloneRange();
    prefix.selectNodeContents(element);
    prefix.setEnd(range.endContainer, range.endOffset);
    return prefix.toString().length;
  };
  const setCaretOffset = (offset: number): void => {
    const selection = getSelectionObject();
    if (!selection) return;
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
    );
    let remaining = offset;
    let targetNode: Text | null = null;
    let targetOffset = 0;
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (remaining <= node.length) {
        targetNode = node;
        targetOffset = remaining;
        break;
      }
      remaining -= node.length;
    }
    const range = document.createRange();
    if (targetNode) range.setStart(targetNode, targetOffset);
    else {
      range.selectNodeContents(element);
      range.collapse(false);
    }
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  };
  const rerender = () => {
    const offset = getCaretOffset();
    colorize(element, getText());
    if (offset != null) setCaretOffset(offset);
  };

  element.addEventListener("input", rerender);
  element.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      options.onSubmit(getText());
    } else if (event.key === "Escape") {
      event.preventDefault();
      options.onEscape?.();
    }
  });
  element.addEventListener("paste", (event) => {
    const text = event.clipboardData?.getData("text/plain");
    if (text == null) return;
    event.preventDefault();
    document.execCommand("insertText", false, text);
  });

  const field: AddressField = {
    setValue(text) {
      colorize(element, text);
    },
    getValue() {
      return getText();
    },
    selectAll() {
      const selection = getSelectionObject();
      if (!selection) return;
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
    },
    shake() {
      element.classList.remove("shake");
      void element.offsetWidth;
      element.classList.add("shake");
      setTimeout(() => element.classList.remove("shake"), 450);
    },
  };
  element.addEventListener("focus", () => {
    setTimeout(() => field.selectAll(), 0);
  });
  return field;
}
