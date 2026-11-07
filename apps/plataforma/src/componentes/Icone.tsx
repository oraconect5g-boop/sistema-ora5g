import {
  Building2, ChartColumn, ClipboardCheck, FileUp, Globe, House, MessageCircle, Package, Receipt, ScrollText,
  ShoppingCart, Signal, Tags, Target, Wallet, Wrench, type LucideIcon,
} from "lucide-react";

const ICONES: Record<string, LucideIcon> = {
  inicio: House,
  vender: ShoppingCart,
  vendas: Receipt,
  estoque: Package,
  aprovacoes: ClipboardCheck,
  connect: Signal,
  assistencia: Wrench,
  metas: Target,
  financeiro: Wallet,
  relatorios: ChartColumn,
  clientes: MessageCircle,
  produtos: Tags,
  canais: Globe,
  lojas: Building2,
  importacao: FileUp,
  auditoria: ScrollText,
};

export function Icone({ nome, className = "size-5" }: { nome: string; className?: string }) {
  const Componente = ICONES[nome] ?? House;
  return <Componente aria-hidden className={className} />;
}
