export function formatProposalNumber(prefix: string, counter: number): string {
  return `${prefix}${String(counter).padStart(4, '0')}`;
}
