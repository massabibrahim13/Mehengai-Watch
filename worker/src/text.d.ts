// lets TypeScript import the prompt text file (wrangler bundles .txt files as strings, see wrangler.toml)
declare module "*.txt" {
  const text: string;
  export default text;
}
