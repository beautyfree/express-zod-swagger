import type { OpenApiZodAny } from '@anatine/zod-openapi';
import { generateSchema } from '@anatine/zod-openapi';
import type { Layer, RequestHandler, Router } from 'express';
import { keys, set } from 'lodash';
import { mapValues, reduce } from 'lodash/fp';
import type {
  OperationObject,
  ParameterLocation,
  ParameterObject,
  PathsObject,
  RequestBodyObject,
  ResponseObject,
  ResponsesObject,
  SchemaObject,
} from 'openapi3-ts';
import type { SwaggerUiOptions } from 'swagger-ui-express';
import swaggerUi from 'swagger-ui-express';
import type { AnyZodObject } from 'zod';
import { ZodObject } from 'zod';

import type { ZodValidatorProps } from './zodValidator';

function findSchemaInStack(stack: Layer): ZodValidatorProps | undefined {
  if (Object.prototype.hasOwnProperty.call(stack.handle, '_VALIDATOR_PROPS')) {
    // @ts-ignore
    return stack.handle._VALIDATOR_PROPS as ZodValidatorProps;
  }

  if (stack.route) {
    for (const stackItem of stack.route.stack) {
      return findSchemaInStack(stackItem);
    }
  }
}

const fillSchemaParameter = (parameters: ParameterObject[], object: AnyZodObject, type: ParameterLocation): void => {
  for (const name in object.shape) {
    const zodType = object.shape[name] as OpenApiZodAny;

    if (zodType instanceof ZodObject) {
      fillSchemaParameter(parameters, zodType, type);
      continue;
    }

    const metaOpenApi = zodType.metaOpenApi as SchemaObject;

    const parameter: ParameterObject & { schema: SchemaObject } = {
      in: type,
      name,
      description: metaOpenApi?.description,
      schema: generateSchema(zodType),
      required: !zodType.isOptional(),
    };

    parameters.push(parameter);
  }
};

function fillSchemaParameters(parameters: ParameterObject[], schema?: ZodValidatorProps): void {
  if (!schema) {
    return;
  }

  schema.parameters?.params && fillSchemaParameter(parameters, schema.parameters.params, 'path');

  schema.parameters?.query && fillSchemaParameter(parameters, schema.parameters.query, 'query');

  schema.parameters?.headers && fillSchemaParameter(parameters, schema.parameters.headers, 'header');
}

const fillSchemaResponse = (schema: OpenApiZodAny): ResponseObject => {
  return {
    description: (schema.metaOpenApi as SchemaObject)?.description ?? '',
    content: {
      'application/json': { schema: generateSchema(schema) },
    },
  };
};

function fillSchemaResponses(schema?: ZodValidatorProps): ResponsesObject | undefined {
  if (!schema) {
    return;
  }

  return mapValues(fillSchemaResponse, schema.responses);
}

function fillSchemaRequestBody(schema?: ZodValidatorProps): RequestBodyObject | undefined {
  if (!schema?.requestBody) {
    return;
  }

  return {
    description: schema.requestBody.description,
    content: {
      'application/json': {
        schema: generateSchema(schema.requestBody),
      },
    },
  };
}

const generatePathParameters = (stack: Layer): OperationObject => {
  const schema = findSchemaInStack(stack);
  const options: OperationObject & {
    parameters: ParameterObject[];
    requestBody?: RequestBodyObject;
  } = {
    parameters: [],
    responses: fillSchemaResponses(schema) ?? {},
    requestBody: fillSchemaRequestBody(schema),
  };

  options.summary = schema?.summary;
  options.description = schema?.description;

  fillSchemaParameters(options.parameters, schema);

  return options;
};

const formatPath = (path: string, specs: OperationObject): string => {
  if (specs.parameters) {
    specs.parameters.forEach((param) => {
      if ((param as ParameterObject).in === 'path') {
        path = path.replace(`:${(param as ParameterObject).name}`, `{${(param as ParameterObject).name}}`);
      }
    });
  }

  return path;
};

const mapAllMethods = (paths: PathsObject, stack: Layer): PathsObject => {
  if (!stack.route) {
    return paths;
  }

  const method = keys(stack.route.methods)[0];

  if (!method) {
    return paths;
  }

  const specs = generatePathParameters(stack);
  const path = formatPath(stack.route.path, specs);

  set(paths, `${path}.${method}`, specs);

  return paths;
};

function createExpressSwagger(paths: PathsObject, uiConfig: Partial<SwaggerUiOptions>): RequestHandler {
  set(uiConfig, 'swaggerOptions.spec.openapi', '3.0.0');
  set(uiConfig, 'swaggerOptions.spec.paths', paths);

  return swaggerUi.setup(undefined, uiConfig);
}

export const expressRouterSwagger = (router: Router, uiConfig: Partial<SwaggerUiOptions>): RequestHandler => {
  const paths = reduce(mapAllMethods, {})(router.stack);

  return createExpressSwagger(paths, uiConfig);
};
