import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type core from 'express-serve-static-core';
import type { AnyZodObject, ZodTypeAny } from 'zod';

export type Responses = { [x: number]: ZodTypeAny };

export interface ZodValidatorProps {
  summary?: string;
  description?: string;
  requestBody?: AnyZodObject;
  parameters?: {
    query?: AnyZodObject;
    params?: AnyZodObject;
    headers?: AnyZodObject;
  };
  responses: Responses;
}

export const zodValidator = <
  P = core.ParamsDictionary,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = core.Query,
  Locals extends Record<string, unknown> = Record<string, unknown>,
>(
  props: ZodValidatorProps,
): RequestHandler<P, ResBody, ReqBody, ReqQuery, Locals> => {
  const validatorMiddleware = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (props.parameters?.query && 'query' in req) {
        await props.parameters.query.parseAsync(req.query);
      }

      if (props.parameters?.params && 'params' in req) {
        await props.parameters.params.parseAsync(req.params);
      }

      if (props.parameters?.headers) {
        await props.parameters.headers.parseAsync(req.headers);
      }

      if (props.requestBody && 'body' in req) {
        await props.requestBody.parseAsync(req.body);
      }

      next();
    } catch (error) {
      next(error);
    }
  };

  validatorMiddleware._VALIDATOR_PROPS = props;

  // @ts-ignore
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  return validatorMiddleware;
};
