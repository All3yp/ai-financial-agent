'use client';

import { useRef, useState } from 'react';
import { Download, FileUp, Loader2, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { QuantitativeTeamResult } from '@/lib/agents/quantitative';
import { MAX_QUANTITATIVE_FILE_BYTES, requestQuantitativeAnalysis } from '@/lib/agents/quantitative-client';

const percent = (value: number) => new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 }).format(value);
const money = (value: number, currency: string) => `${currency} ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)}`;

export function QuantitativeDashboard() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<QuantitativeTeamResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function analyze() {
    if (!file || loading) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      if (file.size > MAX_QUANTITATIVE_FILE_BYTES) throw new Error('Input exceeds 1 MiB.');
      const bytes = await file.arrayBuffer();
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        throw new Error('Invalid UTF-8 file.');
      }
      setResult(await requestQuantitativeAnalysis(text));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to analyze input.');
    } finally {
      setLoading(false);
    }
  }

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `quantitative-${result.asOf}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const regime = result?.specialists.marketRegime;
  const risk = result?.specialists.risk?.report.risk;

  return (
    <section className="min-w-0 space-y-6" aria-label="Quantitative analysis">
      <div className="flex flex-wrap items-center gap-3 border-b pb-4">
        <input ref={fileInput} type="file" accept=".json,application/json" className="sr-only" aria-label="Quantitative input JSON" disabled={loading}
          onChange={(event) => { setFile(event.target.files?.[0] ?? null); setResult(null); setError(''); }} />
        <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={loading}><FileUp className="mr-2 size-4" />Input JSON</Button>
        <span className="min-w-0 max-w-64 truncate text-sm text-muted-foreground" title={file?.name}>{file?.name ?? 'No file selected'}</span>
        <Button onClick={analyze} disabled={!file || loading}>{loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}Analyze</Button>
        <Button variant="ghost" size="icon" title="Clear analysis" aria-label="Clear analysis" disabled={loading || (!file && !result && !error)}
          onClick={() => { setFile(null); setResult(null); setError(''); if (fileInput.current) fileInput.current.value = ''; }}><X className="size-4" /></Button>
        <Button variant="ghost" size="icon" title="Download report JSON" aria-label="Download report JSON" onClick={download} disabled={!result || loading}><Download className="size-4" /></Button>
      </div>
      {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
      {loading && <p role="status" className="text-sm text-muted-foreground">Running quantitative analysis...</p>}
      {!result && !loading && !error && <p className="py-8 text-center text-muted-foreground">No quantitative results</p>}
      {result && regime && <>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Market &amp; Portfolio</h2><span className="text-sm text-muted-foreground">As of {result.asOf}</span></div>
        <dl className="grid gap-4 border-b pb-5 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-sm text-muted-foreground">Regime</dt><dd className="mt-2"><Badge variant="secondary">{regime.regime.replaceAll('_', ' ')}</Badge></dd></div>
          <div><dt className="text-sm text-muted-foreground">Realized volatility</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{percent(regime.indicators.annualizedRealizedVolatility)}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Portfolio value</dt><dd className="mt-1 break-words text-xl font-semibold tabular-nums">{risk ? money(risk.currentValue, risk.currency) : 'Not evaluated'}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Historical VaR {risk ? percent(risk.confidence) : ''}</dt><dd className="mt-1 break-words text-xl font-semibold tabular-nums">{risk ? money(risk.valueAtRisk.amount, risk.currency) : 'Not evaluated'}</dd></div>
        </dl>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="min-w-0"><h3 className="mb-3 font-medium">Market horizons</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Observations</th><th className="py-2">Start</th><th className="py-2 text-right">Return</th></tr></thead><tbody>{result.summary.marketHorizons.map((horizon) => <tr key={horizon.horizon} className="border-b"><td className="py-2">{horizon.horizon}</td><td className="whitespace-nowrap py-2">{horizon.startDate}</td><td className="py-2 text-right tabular-nums">{percent(horizon.totalReturn)}</td></tr>)}</tbody></table></div></div>
          <div className="min-w-0"><h3 className="mb-3 font-medium">Sector rotation</h3><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Observations</th><th className="py-2">Leaders</th><th className="py-2">Lagging benchmark</th></tr></thead><tbody>{result.summary.sectorHorizons.map((horizon) => <tr key={horizon.horizon} className="border-b"><td className="py-2">{horizon.horizon}</td><td className="break-words py-2">{horizon.leaders.join(', ')}</td><td className="break-words py-2">{horizon.laggingVsMarket.join(', ') || 'None'}</td></tr>)}</tbody></table></div></div>
        </div>
        {risk && <dl className="grid gap-4 border-b py-4 sm:grid-cols-3"><div><dt className="text-sm text-muted-foreground">Historical CVaR</dt><dd className="break-words font-medium">{money(risk.conditionalValueAtRisk.amount, risk.currency)}</dd></div><div><dt className="text-sm text-muted-foreground">Maximum drawdown</dt><dd className="font-medium">{percent(risk.maxDrawdown)}</dd></div><div><dt className="text-sm text-muted-foreground">Largest holding weight</dt><dd className="font-medium">{percent(risk.concentration.largestWeight)}</dd></div></dl>}
        <section aria-label="Evidence conflicts"><h3 className="mb-3 font-medium">Evidence conflicts ({result.conflicts.length})</h3>{result.conflicts.length === 0 ? <p className="text-sm text-muted-foreground">No reported conflicts</p> : <ul className="space-y-3 text-sm">{result.conflicts.map((conflict, index) => <li key={`${conflict.type}-${index}`} className="break-words border-l-2 border-amber-500 pl-3"><span className="font-medium">{conflict.subject}</span><p className="text-muted-foreground">{conflict.explanation}</p></li>)}</ul>}</section>
        <details className="border-t pt-4" open><summary className="cursor-pointer font-medium">Warnings &amp; limitations</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">{[...new Set([...result.warnings, ...result.limitations])].map((warning) => <li key={warning} className="break-words">{warning}</li>)}</ul></details>
      </>}
    </section>
  );
}