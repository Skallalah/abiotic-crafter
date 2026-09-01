/** Vite émet l'URL du fichier ; TypeScript n'en sait rien sans ceci. */
declare module "*.png" {
  const url: string;
  export default url;
}
