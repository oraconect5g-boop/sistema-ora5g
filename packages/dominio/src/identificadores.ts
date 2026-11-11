// IMEI (15 dígitos) e ICCID (19–20 dígitos) com dígito verificador (Luhn).
// Sem leitor de código, a digitação manual erra: a validação é obrigatória (lacuna L-04).

function luhnValido(digitos: string): boolean {
  let soma = 0;
  for (let i = 0; i < digitos.length; i++) {
    let d = Number(digitos[digitos.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    soma += d;
  }
  return soma % 10 === 0;
}

const soDigitos = (texto: string) => texto.replace(/[\s.-]/g, "");

export function imeiValido(texto: string): boolean {
  const imei = soDigitos(texto);
  return /^\d{15}$/.test(imei) && !/^(\d)\1{14}$/.test(imei) && luhnValido(imei);
}

export function iccidValido(texto: string): boolean {
  const iccid = soDigitos(texto);
  return /^89\d{17,18}$/.test(iccid) && luhnValido(iccid);
}

// Mostra só o final, como nas telas de referência ("IMEI final 4702").
export function mascararIdentificador(texto: string, visiveis = 4): string {
  const limpo = soDigitos(texto);
  return `•••• ${limpo.slice(-visiveis)}`;
}

// Calcula o dígito verificador; útil para gerar IMEIs FICTÍCIOS válidos em testes e demonstração.
export function completarComDigitoVerificador(baseSemDigito: string): string {
  for (let d = 0; d <= 9; d++) {
    if (luhnValido(baseSemDigito + d)) return baseSemDigito + d;
  }
  throw new Error("Base inválida");
}

// CPF (11 dígitos) com os dois dígitos verificadores (módulo 11). Usado na busca EXATA de cliente
// (ADR-002 §2.4): sem CPF válido completo não há consulta, e cada consulta real fica registrada (LGPD).
export function cpfValido(texto: string): boolean {
  const cpf = soDigitos(texto);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (quantos: number) => {
    let soma = 0;
    for (let i = 0; i < quantos; i++) soma += Number(cpf[i]) * (quantos + 1 - i);
    return ((soma * 10) % 11) % 10;
  };
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

// Telefone brasileiro só com dígitos (DDD + número de 8 ou 9 dígitos), para comparação exata.
export function normalizarTelefone(texto: string): string | null {
  const digitos = texto.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return /^[1-9]{2}9?\d{8}$/.test(digitos) ? digitos : null;
}

// CNPJ (14 dígitos) com os dois dígitos verificadores (módulo 11), a mesma regra de
// privado.cnpj_valido no banco. Aceita pontuação; recusa números repetidos.
export function cnpjValido(texto: string): boolean {
  const cnpj = texto.replace(/[\s./-]/g, "");
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digito = (quantos: number) => {
    const pesos = quantos === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const resto = pesos.reduce((soma, peso, i) => soma + Number(cnpj[i]) * peso, 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(12) === Number(cnpj[12]) && digito(13) === Number(cnpj[13]);
}

// 11.222.333/0001-81 (só para exibir; o banco guarda os 14 dígitos).
export function formatarCnpj(texto: string): string {
  const d = texto.replace(/\D/g, "");
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : texto;
}
