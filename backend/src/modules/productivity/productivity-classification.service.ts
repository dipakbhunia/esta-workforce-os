import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, ProductivityCategory } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export interface ClassificationResult {
  category: ProductivityCategory;
  normalizedValue: string;
  ruleId: string | null;
  matchedScope: 'GLOBAL' | 'COMPANY' | 'NONE';
}

export interface BatchClassificationRule {
  category: ProductivityCategory;
  ruleId: string | null;
  matchedScope: 'GLOBAL' | 'COMPANY' | 'NONE';
}

@Injectable()
export class ProductivityClassificationService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeApplicationName(value: string): string {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/\.(exe|app|dmg|msi|lnk)$/i, '')
      .replace(/[\\/_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) throw new BadRequestException('Application name is required');
    return normalized;
  }

  normalizeHostname(value: string): string {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) throw new BadRequestException('Hostname is required');

    let hostname = trimmed;
    try {
      const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
      hostname = new URL(candidate).hostname;
    } catch {
      hostname = trimmed.split('/')[0].split('?')[0].split('#')[0];
    }

    hostname = hostname.replace(/^www\./, '').replace(/\.$/, '').trim();
    if (!hostname || hostname.includes(' ') || hostname.length > 253) {
      throw new BadRequestException('A valid hostname is required');
    }
    return hostname;
  }

  async classifyApplication(applicationName: string, companyId?: string | null): Promise<ClassificationResult> {
    const normalizedName = this.normalizeApplicationName(applicationName);
    const scopes = this.scopes(companyId);
    const rule = await this.prisma.applicationProductivityRule.findFirst({
      where: {
        normalizedName,
        scope: { in: scopes },
        enabled: true,
        deletedAt: null,
      },
      orderBy: { scope: companyId ? 'desc' : 'asc' },
    });

    return {
      category: rule?.category ?? ProductivityCategory.UNCLASSIFIED,
      normalizedValue: normalizedName,
      ruleId: rule?.id ?? null,
      matchedScope: rule ? (rule.companyId ? 'COMPANY' : 'GLOBAL') : 'NONE',
    };
  }

  async classifyWebsite(hostnameOrUrl: string, companyId?: string | null): Promise<ClassificationResult> {
    const normalizedHostname = this.normalizeHostname(hostnameOrUrl);
    const scopes = this.scopes(companyId);
    const rule = await this.prisma.websiteProductivityRule.findFirst({
      where: {
        normalizedHostname,
        scope: { in: scopes },
        enabled: true,
        deletedAt: null,
      },
      orderBy: { scope: companyId ? 'desc' : 'asc' },
    });

    return {
      category: rule?.category ?? ProductivityCategory.UNCLASSIFIED,
      normalizedValue: normalizedHostname,
      ruleId: rule?.id ?? null,
      matchedScope: rule ? (rule.companyId ? 'COMPANY' : 'GLOBAL') : 'NONE',
    };
  }

  async applicationRuleMap(normalizedNames: Iterable<string>, companyIds: Iterable<string | null>): Promise<Map<string, BatchClassificationRule>> {
    const names = this.unique([...normalizedNames].filter(Boolean));
    if (names.length === 0) return new Map();
    const scopes = this.analyticsScopes(companyIds);
    const rules = await this.prisma.applicationProductivityRule.findMany({
      where: {
        normalizedName: { in: names },
        scope: { in: scopes },
        enabled: true,
        deletedAt: null,
      },
      orderBy: [{ companyId: 'asc' }, { normalizedName: 'asc' }],
    });
    return this.buildRuleMap(rules, (rule) => rule.normalizedName);
  }

  async websiteRuleMap(normalizedHostnames: Iterable<string>, companyIds: Iterable<string | null>): Promise<Map<string, BatchClassificationRule>> {
    const hostnames = this.unique([...normalizedHostnames].filter(Boolean));
    if (hostnames.length === 0) return new Map();
    const scopes = this.analyticsScopes(companyIds);
    const rules = await this.prisma.websiteProductivityRule.findMany({
      where: {
        normalizedHostname: { in: hostnames },
        scope: { in: scopes },
        enabled: true,
        deletedAt: null,
      },
      orderBy: [{ companyId: 'asc' }, { normalizedHostname: 'asc' }],
    });
    return this.buildRuleMap(rules, (rule) => rule.normalizedHostname);
  }

  classificationFromMap(map: Map<string, BatchClassificationRule>, normalizedValue: string, companyId?: string | null): BatchClassificationRule {
    const companyRule = companyId ? map.get(`${companyId}:${normalizedValue}`) : undefined;
    return companyRule ?? map.get(`GLOBAL:${normalizedValue}`) ?? {
      category: ProductivityCategory.UNCLASSIFIED,
      ruleId: null,
      matchedScope: 'NONE',
    };
  }

  private buildRuleMap<T extends { id: string; companyId: string | null; category: ProductivityCategory }>(
    rules: T[],
    valueSelector: (rule: T) => string,
  ): Map<string, BatchClassificationRule> {
    const map = new Map<string, BatchClassificationRule>();
    for (const rule of rules) {
      const scope = rule.companyId ?? 'GLOBAL';
      map.set(`${scope}:${valueSelector(rule)}`, {
        category: rule.category,
        ruleId: rule.id,
        matchedScope: rule.companyId ? 'COMPANY' : 'GLOBAL',
      });
    }
    return map;
  }

  private scopes(companyId?: string | null): string[] {
    return companyId ? ['GLOBAL', companyId] : ['GLOBAL'];
  }

  private analyticsScopes(companyIds: Iterable<string | null>): string[] {
    return this.unique(['GLOBAL', ...[...companyIds].filter((id): id is string => Boolean(id))]);
  }

  private unique(values: string[]): string[] {
    return [...new Set(values)];
  }
}
