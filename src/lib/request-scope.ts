/** A replaceable request per action, scoped to a dataset/configuration lifetime. */
export class RequestScope {
  private controllers = new Map<string, AbortController>();
  start(action: string): AbortSignal {
    this.controllers.get(action)?.abort();
    const controller = new AbortController();
    this.controllers.set(action, controller);
    return controller.signal;
  }
  cancelAll(): void {
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
  }
}
