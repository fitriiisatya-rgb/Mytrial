// Minimal local stand-in for @types/node's surface that money.test.ts uses.
// This exists ONLY because this sandbox has no network access to install
// the real @types/node package. Delete this file once `npm install` has
// been run in a real environment — the real @types/node takes over
// automatically and is authoritative.
declare module "node:test" {
  export function test(name: string, fn: () => void | Promise<void>): void;
}
declare module "node:assert/strict" {
  interface Assert {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
    throws(fn: () => unknown, message?: string): void;
  }
  const assert: Assert;
  export default assert;
}
declare function require(name: string): any;
declare const module: { exports: any };
declare const process: { exit(code?: number): void };
