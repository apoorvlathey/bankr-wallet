import { randomUUID } from "node:crypto";

export type TrackedRequestKind = "signature" | "transaction";

export interface TrackedRequest {
  id: string;
  kind: TrackedRequestKind;
  createdAt: number;
  state: "pending" | "complete" | "error";
  result?: unknown;
  error?: string;
  errorCode?: number | string;
  errorData?: unknown;
}

export class RequestTracker {
  private readonly requests = new Map<string, TrackedRequest>();

  start(kind: TrackedRequestKind, work: Promise<unknown>): TrackedRequest {
    const request: TrackedRequest = {
      id: `walletchan-${randomUUID()}`,
      kind,
      createdAt: Date.now(),
      state: "pending",
    };
    this.requests.set(request.id, request);

    work
      .then((result) => {
        const current = this.requests.get(request.id);
        if (!current) return;
        current.state = "complete";
        current.result = result;
      })
      .catch((error) => {
        const current = this.requests.get(request.id);
        if (!current) return;
        current.state = "error";
        current.error = error instanceof Error ? error.message : String(error);
        const code = (error as { code?: unknown })?.code;
        if (typeof code === "number" || typeof code === "string") {
          current.errorCode = code;
        }
        const data = (error as { data?: unknown })?.data;
        if (data !== undefined) {
          current.errorData = data;
        }
      });

    return request;
  }

  get(id: string): TrackedRequest | null {
    return this.requests.get(id) || null;
  }
}
