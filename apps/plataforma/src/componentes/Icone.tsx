import { Activity, ArrowRightLeft, Building2, CalendarClock, ChartColumn, ChartLine, ClipboardCheck, ContactRound, CreditCard, FileText, FileUp, Filter, Globe, HandCoins, House, Landmark, MessageCircle, Package, PackagePlus, PiggyBank, Receipt, ReceiptText, Scale, ScrollText, ShoppingCart, Signal, Tags, Target, Users, Wallet, Wrench, type LucideIcon } from "lucide-react";

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
  tendencias: ChartLine,
  clientes: MessageCircle,
  contatos: ContactRound,
  funil: Filter,
  agenda: CalendarClock,
  conciliacao: Scale,
  maquininhas: CreditCard,
  financeiras: HandCoins,
  recebiveis: CalendarClock,
  contas: ReceiptText,
  resultado: PiggyBank,
  previsao: Landmark,
  produtos: Tags,
  canais: Globe,
  lojas: Building2,
  equipe: Users,
  cadastro: PackagePlus,
  importacao: FileUp,
  auditoria: ScrollText,
  notas: FileText,
  transferencias: ArrowRightLeft,
  operacao: Activity,
};

export function Icone({ nome, className = "size-5" }: { nome: string; className?: string }) {
  const Componente = ICONES[nome] ?? House;
  return <Componente aria-hidden className={className} />;
}
