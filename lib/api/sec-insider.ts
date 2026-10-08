import { load, type Cheerio } from 'cheerio';
import type { AnyNode } from 'domhandler';
import { z } from 'zod';

export const secInsiderTransactionsInputSchema = z
  .object({
    ticker: z
      .string()
      .trim()
      .min(1)
      .max(30)
      .regex(/^[A-Za-z0-9.-]+$/),
    limit: z.number().int().min(1).max(25).default(10),
    includeHistorical: z.boolean().default(true),
    includeAmendments: z.boolean().default(false),
    maxArchivePages: z.number().int().min(1).max(20).default(5),
  })
  .strict();

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });

export interface SECReportingOwner {
  cik: string;
  name: string;
  isDirector: boolean | null;
  isOfficer: boolean | null;
  officerTitle: string | null;
  isTenPercentOwner: boolean | null;
}

export interface SECInsiderTransaction {
  securityTitle: string | null;
  transactionDate: string;
  transactionCode: string | null;
  acquiredDisposed: string | null;
  shares: number | null;
  pricePerShare: number | null;
  sharesOwnedFollowing: number | null;
  directOrIndirect: string | null;
  derivative: boolean;
}

export interface SECInsiderFiling {
  accessionNumber: string;
  form: '4' | '4/A';
  filingDate: string;
  documentUrl: string;
  owners: SECReportingOwner[];
  transactions: SECInsiderTransaction[];
  warnings: string[];
}

const ownerSchema = z
  .object({
    cik: z.string().regex(/^\d{1,10}$/),
    name: z.string().min(1).max(256),
    isDirector: z.boolean().nullable(),
    isOfficer: z.boolean().nullable(),
    officerTitle: z.string().max(256).nullable(),
    isTenPercentOwner: z.boolean().nullable(),
  })
  .strict();

const transactionSchema = z
  .object({
    securityTitle: z.string().max(256).nullable(),
    transactionDate: dateSchema,
    transactionCode: z.string().max(16).nullable(),
    acquiredDisposed: z.string().max(8).nullable(),
    shares: z.number().finite().nonnegative().nullable(),
    pricePerShare: z.number().finite().nonnegative().nullable(),
    sharesOwnedFollowing: z.number().finite().nonnegative().nullable(),
    directOrIndirect: z.string().max(8).nullable(),
    derivative: z.boolean(),
  })
  .strict();

function text(node: Cheerio<AnyNode>, selector: string): string | null {
  const value = node.find(selector).first().text().trim();
  return value || null;
}

function decimal(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value.replaceAll(',', ''));
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('SEC Form 4 contains an invalid numeric transaction value');
  }
  return parsed;
}

function flag(value: string | null): boolean | null {
  if (value === '1') return true;
  if (value === '0') return false;
  return null;
}

export function parseSECInsiderFiling(
  source: string,
  expectedCik: string,
  expectedForm: '4' | '4/A',
): Pick<SECInsiderFiling, 'owners' | 'transactions' | 'warnings'> {
  if (Buffer.byteLength(source, 'utf8') > 5_000_000) {
    throw new Error('SEC Form 4 document exceeds size limit');
  }
  const $ = load(source, { xmlMode: true });
  const document = $('ownershipDocument').first();
  if (!document.length)
    throw new Error('SEC Form 4 ownership document is missing');
  const actualForm = text(document, 'documentType');
  if (actualForm !== expectedForm)
    throw new Error('SEC Form 4 document type does not match filing metadata');
  const issuerCik = text(document, 'issuer issuerCik');
  if (issuerCik !== String(Number(expectedCik))) {
    throw new Error('SEC Form 4 issuer does not match the requested company');
  }

  const owners = document
    .find('reportingOwner')
    .map((_index, element) => {
      const owner = $(element);
      return ownerSchema.parse({
        cik: text(owner, 'reportingOwnerId rptOwnerCik'),
        name: text(owner, 'reportingOwnerId rptOwnerName'),
        isDirector: flag(text(owner, 'reportingOwnerRelationship isDirector')),
        isOfficer: flag(text(owner, 'reportingOwnerRelationship isOfficer')),
        officerTitle: text(owner, 'reportingOwnerRelationship officerTitle'),
        isTenPercentOwner: flag(
          text(owner, 'reportingOwnerRelationship isTenPercentOwner'),
        ),
      });
    })
    .get();
  if (owners.length === 0)
    throw new Error('SEC Form 4 reporting owner is missing');

  const transactions: SECInsiderTransaction[] = [];
  const transactionGroups: Array<{ selector: string; derivative: boolean }> = [
    { selector: 'nonDerivativeTransaction', derivative: false },
    { selector: 'derivativeTransaction', derivative: true },
  ];
  for (const group of transactionGroups) {
    document.find(group.selector).each((_index, element) => {
      const transaction = $(element);
      const parsed = transactionSchema.parse({
        securityTitle: text(transaction, 'securityTitle value'),
        transactionDate: text(transaction, 'transactionDate value'),
        transactionCode: text(transaction, 'transactionCoding transactionCode'),
        acquiredDisposed: text(
          transaction,
          'transactionAmounts transactionAcquiredDisposedCode value',
        ),
        shares: decimal(
          text(transaction, 'transactionAmounts transactionShares value'),
        ),
        pricePerShare: decimal(
          text(
            transaction,
            'transactionAmounts transactionPricePerShare value',
          ),
        ),
        sharesOwnedFollowing: decimal(
          text(
            transaction,
            'postTransactionAmounts sharesOwnedFollowingTransaction value',
          ),
        ),
        directOrIndirect: text(
          transaction,
          'ownershipNature directOrIndirectOwnership value',
        ),
        derivative: group.derivative,
      });
      transactions.push(parsed);
    });
  }

  const warnings: string[] = [];
  if (transactions.length === 0)
    warnings.push(
      'Filing contains no parsed non-derivative or derivative transaction rows.',
    );
  if (transactions.some(({ pricePerShare }) => pricePerShare === null)) {
    warnings.push('Some transaction prices were not reported and remain null.');
  }
  return { owners, transactions, warnings };
}
