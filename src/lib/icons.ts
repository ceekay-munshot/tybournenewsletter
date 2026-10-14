// Icon mapping, kept out of brand.ts so colour tokens stay React-free.
import {
  Cpu,
  CircuitBoard,
  Bot,
  Server,
  Factory,
  Landmark,
  Globe2,
  type LucideIcon,
} from 'lucide-react';
import type { SectorId } from '../types';

export const SECTOR_ICON: Record<SectorId, LucideIcon> = {
  technology: Cpu,
  industrial: Factory,
  financial: Landmark,
  macro: Globe2,
};

const SYSTEM_ICON: Record<string, LucideIcon> = {
  'cpu-prices': Cpu,
  'taiwan-semi-revenue': CircuitBoard,
  'ai-compute-pricing': Bot,
  'schneider-electric': Server,
};

export function iconFor(systemId: string, sector: SectorId): LucideIcon {
  return SYSTEM_ICON[systemId] ?? SECTOR_ICON[sector] ?? Cpu;
}
