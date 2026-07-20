# Chat UI audit map

- `ChatView.tsx` coordinates conversation-list and active-chat modes.
- `ChatList.tsx` renders saved conversation choices.
- `ChatHeader.tsx`, `ChatInput.tsx`, and `MessageList.tsx` compose the active
  conversation surface.
- `MessageBubble.tsx` renders one user or assistant message.
- `ShapesLoader.tsx` is the feature loading treatment. Its default adapts to
  the active theme; `variant="dots"` provides the shared monochrome pulse used
  when a filled control needs a fixed-contrast loading state.

Chat state and background messaging enter through the feature controller/hook;
message presentation must not duplicate credential or Bankr authorization
policy.
