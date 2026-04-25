type UnknownRecord = Record<string, unknown>;
type AnyRouteHandler = (message: UnknownRecord) => unknown;

const asRecord = (value: unknown): UnknownRecord | null =>
  typeof value === "object" && value !== null ? (value as UnknownRecord) : null;

export type RouteHandler<TResult> = (message: UnknownRecord) => TResult;

export type RouteTable = Readonly<Record<string, AnyRouteHandler>>;

type RouteResult<T extends RouteTable> = ReturnType<T[keyof T]>;

export const routeByType = <TRoutes extends RouteTable>(
  message: unknown,
  routes: TRoutes
): RouteResult<TRoutes> | undefined => {
  const record = asRecord(message);
  if (!record) return undefined;
  const type = record.type;
  if (typeof type !== "string") return undefined;
  const handler = routes[type];
  if (!handler) return undefined;
  return handler(record) as RouteResult<TRoutes>;
};

export const guardedRoute = <
  TMessage,
  TOnValid extends (value: TMessage) => unknown,
  TOnInvalid extends () => unknown,
>(
  message: unknown,
  guard: (value: unknown) => value is TMessage,
  onValid: TOnValid,
  onInvalid: TOnInvalid
): ReturnType<TOnValid> | ReturnType<TOnInvalid> =>
  guard(message)
    ? (onValid(message) as ReturnType<TOnValid> | ReturnType<TOnInvalid>)
    : (onInvalid() as ReturnType<TOnValid> | ReturnType<TOnInvalid>);
