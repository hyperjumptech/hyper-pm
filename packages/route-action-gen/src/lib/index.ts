import type { z } from "zod";

/** Authorization hook used by request validators that require a user. */
export type AuthFunc<TUser> = () => Promise<TUser>;

type ValidatorShape = {
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
  searchParams?: z.ZodType;
  user?: AuthFunc<unknown>;
};

type OptionalInfer<Z extends z.ZodType | undefined> = Z extends z.ZodType
  ? z.infer<Z>
  : undefined;

/** Merged request data passed to handlers based on the validator shape. */
export type Merged<T extends ValidatorShape> = {
  body: OptionalInfer<T["body"]>;
  params: OptionalInfer<T["params"]>;
  query: OptionalInfer<T["query"]>;
  user: T["user"] extends AuthFunc<infer U> ? U : undefined;
};

/**
 * Declares validators for body, params, query, and auth. Generation tooling consumes this shape.
 *
 * @param shape - Partial map of Zod validators and optional auth function.
 */
export const createRequestValidator = <const T extends ValidatorShape>(
  shape: T,
): T => shape;

/**
 * Route / API handler typing helper tied to {@link createRequestValidator} output.
 */
export type HandlerFunc<
  TReq extends ValidatorShape,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- mirrors generated route handler arity
  TRes extends z.ZodType = z.ZodType,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Extra = undefined,
> = (data?: Merged<TReq>) => Promise<Response>;

/**
 * JSON success response with stable content type.
 *
 * @param body - Serializable JSON object.
 */
export const successResponse = (
  body: Record<string, unknown>,
): Response => {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

/**
 * JSON error response helper for handlers.
 *
 * @param message - Human-readable error.
 * @param _details - Reserved for structured errors (unused in minimal stub).
 * @param status - HTTP status code.
 */
export const errorResponse = (
  message: string,
  _details: undefined,
  status = 400,
): Response => {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
};
