declare module "vdf" {
    export function parse<T = any>(input: string): T;
    export function stringify(input: any): string;
}
