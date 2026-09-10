import type { Dataset, RegistryEntity, Metric } from "./types";
import type { ResponsibleContact } from "./contact-store";
export const PERIOD_LABELS: Readonly<Record<string, string>>;
export const KIND_LABELS: Readonly<Record<RegistryEntity["kind"], string>>;
export const LINK_BUDGET: number;
export type PortfolioSnapshot = {
  target: number | null; actual: number | null; attainment: number | null;
  projected: number | null; projectedAttainment: number | null; gap: number | null;
  projectionGap: number | null; requiredDaily: number | null; requiredMonthly: number | null;
  remainingDays: number | null; dailyTarget: number | null;
  complete: boolean; phase: string; status: string; annualConflict: boolean; start: string; end: string;
};
export type PortfolioSection = { metric: Metric; label: string; available: false } | {
  metric: Metric; label: string; available: true; cutoff: string; cutoffMin: string;
  current: PortfolioSnapshot; annual: PortfolioSnapshot; individualGap: number | null;
  childCount: number; action: string; priorities: { name: string; gap: number }[];
  monthly: (PortfolioSnapshot & { label: string })[];
};
export type PortfolioReport = {
  version: 1; year: number; month: number; period: string; periodLabel: string;
  source: "base" | "cadence"; uplift: number; entity: RegistryEntity; sections: PortfolioSection[];
};
export type PortfolioMessage = { subject: string; text: string; whatsapp: string; html: string };
export function escapeHtml(value: unknown): string;
export function entityFromAnalysis(row: { [key: string]: any }): RegistryEntity;
export function recipientsForContacts(contacts: ResponsibleContact[], year: number, entity: RegistryEntity): ResponsibleContact[];
export function normalizeRecipients(values: string | string[]): string[];
export function whatsappNumber(value: string): string;
export function buildPortfolioReport(options: { dataset: Dataset; entity: RegistryEntity; metric?: Metric; includeBoth?: boolean; month?: number; period?: string; uplift?: number }): PortfolioReport;
export function renderPortfolioCommunication(report: PortfolioReport, options?: { names?: string[]; intro?: string; signature?: string; subject?: string }): PortfolioMessage;
export function buildOutlookLink(options: { recipients?: string[]; subject: string; body?: string; personal?: boolean }): { url: string; requiresPaste: boolean };
export function buildWhatsappLink(options: { phone?: string; body?: string }): { url: string; requiresPaste: boolean };
export function buildEmailFile(options: { recipients?: string[]; subject: string; text: string; html: string }): string;
