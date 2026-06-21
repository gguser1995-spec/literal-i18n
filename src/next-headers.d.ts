declare module 'next/headers' {
  export function headers(): Promise<{ get(name: string): string | null }> | { get(name: string): string | null };
}
