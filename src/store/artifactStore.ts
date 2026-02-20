export interface RenderMetadata {
  title: string;
  finalUrl: string;
  status: number | null;
  contentType: string;
  timings: {
    startedAt: string;
    finishedAt: string;
    ms: number;
  };
}

export interface ArtifactRecord {
  screenshotBuffer: Buffer;
  markdownText: string;
  metadata: RenderMetadata;
  createdAt: number;
}

export class ArtifactStore {
  private readonly data = new Map<string, ArtifactRecord>();
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(private readonly ttlMs: number, cleanupEveryMs = 60_000) {
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupEveryMs);
    this.cleanupInterval.unref();
  }

  set(jobId: string, record: Omit<ArtifactRecord, "createdAt">): void {
    this.data.set(jobId, { ...record, createdAt: Date.now() });
  }

  get(jobId: string): ArtifactRecord | undefined {
    const record = this.data.get(jobId);
    if (!record) return undefined;
    if (this.isExpired(record.createdAt)) {
      this.data.delete(jobId);
      return undefined;
    }
    return record;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [jobId, record] of this.data.entries()) {
      if (now - record.createdAt > this.ttlMs) {
        this.data.delete(jobId);
      }
    }
  }

  shutdown(): void {
    clearInterval(this.cleanupInterval);
  }

  private isExpired(createdAt: number): boolean {
    return Date.now() - createdAt > this.ttlMs;
  }
}
