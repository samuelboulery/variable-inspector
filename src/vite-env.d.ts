/// <reference types="vite/client" />

declare module '*.html?raw' {
  const content: string;
  export default content;
}

declare module '*.css?raw' {
  const content: string;
  export default content;
}

// Vite injects `process.env.NODE_ENV` as a string literal at build time.
// Avoid pulling in @types/node just for this single global.
declare const process: {
  env: {
    NODE_ENV?: string;
  };
};
