# Bankr chat audit map

1. `storage.ts` owns the unchanged `chatHistory` key, conversation cap, and
   per-conversation message cap.
2. `client.ts` bounds prompt/history text and remote bodies, validates job IDs,
   and delegates polling to `../jobs.ts`.
3. `handlers.ts` restores an authorized Bankr session when permitted, snapshots
   bounded history, starts one background job, records its terminal result, and
   emits the existing UI messages.

Background, UI, and domain callers import this directory directly. The storage
key, renderer message shapes, and request ordering are unchanged.
