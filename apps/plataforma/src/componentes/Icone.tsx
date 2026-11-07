import {
  Building2, ClipboardCheck, FileUp, Globe, House, MessageCircle, Package,
  ShoppingCart, Signal, Target, Wallet, Wrench, type LucideIcon,
} from "lucide-react";

const ICONES: Record<string, LucideIcon> = {
  inicio: House, vender: ShoppingCart, estoque: Package, aprovacoes: ClipboardCheck, connect: Signal,
  assistencia: Wrench, metas: Target, financeiro: Wallet, clientes: MessageCircle, canais: Globe,
  lojas: Building2, importacao: FileUp,
};

export function Icone({ nome, className = "size-5" }: { nome: string; className?: string }) {
  const Componente = ICONES[nome] ?? House;
  return <Componente aria-hidden className={className} />;
}
