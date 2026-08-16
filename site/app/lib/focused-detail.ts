import type {
  SiteDetailKind,
  SiteReadyCaseDetail,
  SiteReadyCasePacket,
} from "./lineage/contracts";

export function focusedDetailKey(
  packet: SiteReadyCasePacket,
  kind: SiteDetailKind,
  id: string,
): string {
  return `${packet.case_id}:${packet.run_id}:${kind}:${id}`;
}

export function needsPreparedDetailSupplement(
  packet: SiteReadyCasePacket,
  kind: SiteDetailKind,
): boolean {
  return packet.mode !== "live" && kind === "source";
}

export class FocusedDetailSupplementCache {
  private readonly resolved = new Map<string, SiteReadyCaseDetail>();
  private readonly pending = new Map<string, Promise<SiteReadyCaseDetail>>();
  private readonly failed = new Map<string, Error>();

  load(
    key: string,
    loader: () => Promise<SiteReadyCaseDetail>,
  ): Promise<SiteReadyCaseDetail> {
    const resolved = this.resolved.get(key);
    if (resolved) return Promise.resolve(resolved);

    const failed = this.failed.get(key);
    if (failed) return Promise.reject(failed);

    const pending = this.pending.get(key);
    if (pending) return pending;

    const request = loader()
      .then((detail) => {
        this.resolved.set(key, detail);
        return detail;
      })
      .catch((error: unknown) => {
        const failure = error instanceof Error
          ? error
          : new Error("focused detail supplement unavailable");
        this.failed.set(key, failure);
        throw failure;
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, request);
    return request;
  }
}
