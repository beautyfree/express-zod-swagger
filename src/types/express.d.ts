/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import 'express';

declare module 'express' {
  class Layer {
    handle: Handler;
    name: string | null;
    path: string;
    regexp: RegExp;
    route?: {
      path: string;
      stack: Layer[];
      methods: { [key in string]: boolean };
    };
    method?: string;
  }

  interface IRouter {
    stack: Layer[];
  }
}
