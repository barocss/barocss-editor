export interface PeerPausePort {
  inspect(): { phase: string };
  setPaused(paused: boolean): void;
}

/** The page lifecycle must not change the user's connection choice. */
export class PeerLifecycle {
  private readonly peer: PeerPausePort;
  private pausedBeforeSuspend: boolean | undefined;
  constructor(peer: PeerPausePort) { this.peer = peer; }
  suspend(): void {
    if (this.pausedBeforeSuspend === undefined) this.pausedBeforeSuspend = this.peer.inspect().phase === 'paused';
    this.peer.setPaused(true);
  }
  resume(): void {
    const paused = this.pausedBeforeSuspend;
    this.pausedBeforeSuspend = undefined;
    if (paused !== undefined) this.peer.setPaused(paused);
  }
}
