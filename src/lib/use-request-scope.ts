import { useLayoutEffect, useRef } from "react";
import { RequestScope } from "./request-scope";
/**
 * One stable scope per component. Requests in flight are cancelled when the
 * data or settings change, and on unmount.
 */
export function useRequestScope(data: unknown, settings?: unknown) {
  const ref = useRef<RequestScope | null>(null);
  ref.current ??= new RequestScope();
  const scope = ref.current;
  useLayoutEffect(() => () => scope.cancelAll(), [scope, data, settings]);
  return scope;
}
