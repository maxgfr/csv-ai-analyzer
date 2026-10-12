/** A replaceable request per action, scoped to a dataset/configuration lifetime. */
export class RequestScope {
  private controllers = new Map<string, AbortController>();
  start(action: string): AbortSignal {
    this.controllers.get(action)?.abort();
    const controller = new AbortController();
    this.controllers.set(action, controller);
    return controller.signal;
  }
  /** Cancel one action only (e.g. clearing the chat leaves the summary running). */
  cancel(action: string): void {
    this.controllers.get(action)?.abort();
    this.controllers.delete(action);
  }
  /**
   * False once a newer request replaced this one for the same action. A request
   * that is merely cancelled stays the latest, so its loading state can be reset.
   */
  isLatest(action: string, signal: AbortSignal): boolean {
    const current = this.controllers.get(action);
    return !current || current.signal === signal;
  }
  cancelAll(): void {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }
}
