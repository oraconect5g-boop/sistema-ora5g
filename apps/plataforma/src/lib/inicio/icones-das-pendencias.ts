// O ícone de cada pendência (Início e sino do topo, G6). A leitura devolve só o nome (vai pela rede até o sino); a tela
// troca o nome pelo ícone daqui.
import {
  AlarmClock, ArrowRightLeft, BadgePercent, Banknote, CreditCard, FileClock, FileText, FileUp, FileWarning, Gift, HandCoins, PackageCheck, PackageMinus, PhoneCall, RadioTower, ReceiptText,
  RotateCcw, Scale, Send, ShieldAlert, SignalZero, Undo2, Wallet, Wrench, type LucideIcon,
} from "lucide-react";

export const ICONES_DAS_PENDENCIAS = {
  desconto: BadgePercent,
  nota: FileText,
  saida_do_caixa: Banknote,
  conta_a_pagar: ReceiptText,
  bonus: Gift,
  caixa: Wallet,
  transferencia: ArrowRightLeft,
  operadora: RadioTower,
  estorno: RotateCcw,
  retorno: Undo2,
  os_atrasada: AlarmClock,
  os_pronta: PackageCheck,
  os_do_tecnico: Wrench,
  caixa_com_diferenca: Scale,
  nota_parada: FileClock,
  ativacao_com_falha: SignalZero,
  nota_com_divergencia: ShieldAlert,
  // FIN-007b: o repasse da financeira que passou do prazo e a cobrança com o dia de voltar ao assunto chegado.
  repasse_atrasado: HandCoins,
  cobranca_a_retomar: PhoneCall,
  // REPORT-001b: só no Início (o sino não lê o painel do estoque).
  estoque_abaixo_do_minimo: PackageMinus,
  // Saúde da operação (Q1): as filas que não estão no Início.
  envio_whatsapp: Send,
  pagamento_a_conciliar: CreditCard,
  importacao: FileUp,
  // SAUDE-a (ADR-012): a venda concluída sem o pedido da nota.
  venda_sem_nota: FileWarning,
} as const satisfies Record<string, LucideIcon>;

export type NomeDoIconeDaPendencia = keyof typeof ICONES_DAS_PENDENCIAS;
export const ehNomeDoIconeDaPendencia = (v: unknown): v is NomeDoIconeDaPendencia => typeof v === "string" && Object.hasOwn(ICONES_DAS_PENDENCIAS, v);
