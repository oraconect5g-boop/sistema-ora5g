import { createServer } from "vite";
import { dirname, resolve } from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pasta = dirname(fileURLToPath(import.meta.url));
const repo = resolve(pasta, "../../../../..");
const porta = Number(process.env.ORA_PORTA_FIXTURE ?? "3195");
const modulos = {
  "next/navigation": 'export const useRouter=()=>({refresh:()=>{window.auditoria.refreshes++}});',
  "next/link": 'import React from "react";export default function Link({href,children,...p}){return React.createElement("a",{href,...p},children);}',
  "@supabase/ssr": 'export const createBrowserClient=()=>({storage:{from:()=>({upload:async(path,blob)=>{window.auditoria.uploads.push({path,size:blob.size});return {error:null}}})}});',
  "acao-foto": 'export async function registrarFoto(dados){window.auditoria.registros.push(dados);return window.auditoria.falharRegistro?{ok:false,erro:"registro"}:{ok:true};}',
};
const servidor = await createServer({
  root: pasta, configFile: false,
  server: { host: "127.0.0.1", port: porta, strictPort: true, fs: { allow: [repo, resolve(realpathSync(resolve(repo, "node_modules")), "..")] } },
  oxc: { jsx: { runtime: "automatic" } },
  define: { "process.env.NODE_ENV": JSON.stringify("development") },
  plugins: [{
    name: "servicos-ficticios", enforce: "pre",
    resolveId(origem, importador) {
      if (origem === "@produto/EnviarFoto") return resolve(repo, "apps/plataforma/src/app/catalogo/EnviarFoto.tsx");
      if (origem === "@produto/FotoAmpliavel") return resolve(repo, "apps/plataforma/src/app/catalogo/FotoAmpliavel.tsx");
      if (origem === "./acoes" && importador?.endsWith("/catalogo/EnviarFoto.tsx")) return "\0fixture:acao-foto";
      if (Object.hasOwn(modulos, origem)) return "\0fixture:" + origem;
    },
    load(id) { if (id.startsWith("\0fixture:")) return modulos[id.slice(9)]; },
  }],
});
await servidor.listen();
process.stdout.write("Fixture local de fotos: 127.0.0.1:" + porta + "\n");

