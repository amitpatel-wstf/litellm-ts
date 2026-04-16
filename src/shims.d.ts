declare const process: {
  env: Record<string, string | undefined>;
};

declare module "ioredis" {
  export default class Redis {
    constructor(url?: string);
    get(key: string): Promise<string | null>;
    set(key: string, value: string, mode?: string, ttl?: number): Promise<unknown>;
    del(key: string): Promise<number>;
    quit(): Promise<void>;
  }
}

declare module "node:crypto" {
  export function createHash(algorithm: string): {
    update(input: string): { digest(format: "hex"): string };
    digest(format: "hex"): string;
  };
}
