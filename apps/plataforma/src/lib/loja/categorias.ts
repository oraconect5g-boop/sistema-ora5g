// O desenho das categorias da loja online (lote ONLINE-g): um ícone para cada família, achado pelo nome (sem acento e sem
// diferença de maiúsculas; a família que não se reconhece fica com o pacote), e os atalhos da vitrine principal: até 4
// categorias, nesta ordem de preferência, entre as que têm produto no site (sem nenhuma preferida, as primeiras).
import {
  BatteryCharging, BatteryFull, Cable, Calculator, Camera, CupSoda, Gamepad2, Headphones, KeyRound, Lamp, Laptop, Layers, Lock,
  MemoryStick, Mic, Package, Plug, ShieldCheck, Smartphone, Sparkles, Speaker, Usb, Watch, type LucideIcon,
} from "lucide-react";

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

const ICONES: readonly (readonly [RegExp, LucideIcon])[] = [
  [/CAIXA DE SOM/, Speaker], [/CAPA|CAPINHA/, Smartphone], [/PELICULA/, ShieldCheck], [/CARREGADOR|FONTE/, BatteryCharging],
  [/CABO/, Cable], [/FONE|HEADSET/, Headphones], [/PILHA|BATERIA/, BatteryFull], [/GAMER|CONTROLE/, Gamepad2], [/PENDRIVE/, Usb],
  [/MEMORIA/, MemoryStick], [/MICROFONE/, Mic], [/CAMERA/, Camera], [/SMARTWATCH|RELOGIO/, Watch], [/LUMINARIA|LAMPADA/, Lamp],
  [/GARRAFA/, CupSoda], [/CADEADO/, Lock], [/CALCULADORA/, Calculator], [/CHAVE/, KeyRound], [/MAQUIAGEM/, Sparkles],
  [/ADAPTADOR|TOMADA/, Plug], [/SUPORTE/, Layers], [/INFORMATICA/, Laptop], [/CELULAR|APARELHO/, Smartphone],
];

/** O ícone da categoria pelo nome; a que não se reconhece fica com o pacote. */
export function iconeDaCategoria(nome: string): LucideIcon {
  const n = normal(nome);
  return ICONES.find(([regra]) => regra.test(n))?.[1] ?? Package;
}

const PREFERIDAS = [/FONE/, /CAPA|CAPINHA/, /CARREGADOR/, /CAIXA DE SOM/, /SMARTWATCH/, /CABO/, /PELICULA/, /SUPORTE/];

/** Os atalhos da vitrine principal: até `quantos` categorias, as preferidas primeiro, sem repetir. */
export function atalhosDoInicio<T extends { id: string; nome: string }>(categorias: readonly T[], quantos = 4): T[] {
  const escolhidas: T[] = [];
  for (const regra of PREFERIDAS) {
    if (escolhidas.length === quantos) return escolhidas;
    const achada = categorias.find((c) => regra.test(normal(c.nome)) && !escolhidas.includes(c));
    if (achada) escolhidas.push(achada);
  }
  for (const c of categorias) {
    if (escolhidas.length === quantos) break;
    if (!escolhidas.includes(c)) escolhidas.push(c);
  }
  return escolhidas;
}
