# Avatar image cache tests

Review in the same order as `src/chrome/avatar/`:

1. `policy.test.ts` freezes public-HTTPS SSRF policy, raster MIME policy, and
   trusted-renderer cache revalidation.
2. `bodyReader.test.ts` freezes declared and streamed body ceilings.
3. `scheduler.test.ts` covers two-concurrent FIFO execution, same-URL
   single-flight, controller abort, and reset-epoch handling.
4. `transport.test.ts` covers manual redirect revalidation, redirect count,
   ambient-authority omission, MIME/body bounds, and null network errors.
5. `rasterizer.test.ts` covers resize policy, no upscaling, output bounds, and
   bitmap cleanup on every decoded path.
6. `repository.test.ts` covers exact schema/key behavior, corruption/expiry,
   200-entry/5 MiB LRU, serialized commits, and best-effort storage.
7. `coordinator.test.ts` covers cache reuse, rich-input rejection, null errors,
   and reset races during decode and storage commit.
8. `architecture.test.ts` freezes facade identities, dependency direction, and
   audit-size budgets.
