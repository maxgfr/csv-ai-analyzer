import { useLayoutEffect, useMemo } from "react";
import { RequestScope } from "./request-scope";
export function useRequestScope(data: unknown, settings?: unknown) {
  const scope = useMemo(() => new RequestScope(), [data, settings]);
  useLayoutEffect(() => () => scope.cancelAll(), [scope]);
  return scope;
}
