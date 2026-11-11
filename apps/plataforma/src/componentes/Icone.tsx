import {
  ArrowRightLeft, Building2, CalendarClock, ChartColumn, ClipboardCheck, ContactRound, FileText, Filter, FileUp, Globe, House, MessageCircle, Package, PackagePlus, Receipt, ScrollText,
  ShoppingCart, Signal, Tags, Target, Users, Wallet, Wrench, type LucideIcon,
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
  contatos: ContactRound,
  funil: Filter,
  agenda: CalendarClock,
  produtos: Tags,
  canais: Globe,
  lojas: Building2,
  equipe: Users,
  cadastro: PackagePlus,
  importacao: FileUp,
  auditoria: ScrollText,
  notas: FileText,
  transferencias: ArrowRightLeft,
};

export function Icone({ nome, className = "size-5" }: { nome: string; className?: string }) {
  const Componente = ICONES[nome] ?? House;
  return <Componente aria-hidden className={className} />;
}
