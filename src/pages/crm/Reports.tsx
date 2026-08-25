// /crm/reports — the marketing company's questions, answerable for any date
// range: headline numbers, won $ by referral source (with campaign
// drill-down), leads by source, by segment, monthly trend, and stage counts
// over time from deal_stage_history. Segment filter applies everywhere.
// Archived contacts' deals are excluded, matching the pipeline's numbers.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PRESET_LABEL,
  easternMonth,
  inRange,
  monthsBetween,
  presetRange,
  useReportDeals,
  useStageEntries,
  type RangePreset,
  type ReportDeal,
} from '@/lib/crm/api/reports';
import {
  SEGMENTS,
  SEGMENT_META,
  SOURCES,
  SOURCE_LABEL,
  STAGES,
  STAGE_META,
  formatDollars,
  type DealSegment,
} from '@/lib/crm/types';
import { cn } from '@/lib/utils';

// Brand palette for chart series (from the brief)
const ORANGE = '#D2782D';
const STEEL = '#6b7280';

const PRESETS: RangePreset[] = [
  'this_month', 'last_month', 'this_quarter', 'last_quarter', 'ytd', 'last_12', 'custom',
];

export default function Reports() {
  const { data: deals = [], isLoading } = useReportDeals();
  const { data: entries = [] } = useStageEntries();
  const [params, setParams] = useSearchParams();

  const preset = (params.get('range') as RangePreset) || 'last_12';
  const segment = (params.get('segment') as DealSegment | null) || null;
  const [defFrom, defTo] = presetRange(preset === 'custom' ? 'last_12' : preset);
  const from = preset === 'custom' ? params.get('from') || defFrom : defFrom;
  const to = preset === 'custom' ? params.get('to') || defTo : defTo;

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  // ── filtered populations ───────────────────────────────────────────
  const live = useMemo(
    () => deals.filter((d) => !d.archived && (!segment || d.segment === segment)),
    [deals, segment]
  );
  const liveEntries = useMemo(
    () => entries.filter((e) => !e.archived && (!segment || e.segment === segment)),
    [entries, segment]
  );

  const created = useMemo(() => live.filter((d) => inRange(d.created_at, from, to)), [live, from, to]);
  const won = useMemo(() => live.filter((d) => inRange(d.won_at, from, to)), [live, from, to]);
  const lost = useMemo(
    () => live.filter((d) => d.stage === 'lost' && inRange(d.lost_at, from, to)),
    [live, from, to]
  );

  const wonValue = won.reduce((n, d) => n + d.value, 0);
  const closed = won.length + lost.length;
  const winRate = closed ? Math.round((won.length / closed) * 100) : null;

  // ── section 2: won by source (with source_detail drill-down) ───────
  const wonBySource = useMemo(() => groupBySource(won), [won]);
  // ── section 3: leads by source (cohort created in period) ──────────
  const leadsBySource = useMemo(() => {
    return SOURCES.map((s) => {
      const cohort = created.filter((d) => d.source === s);
      const cohortWon = cohort.filter((d) => d.stage === 'won');
      const cohortLost = cohort.filter((d) => d.stage === 'lost');
      const cohortClosed = cohortWon.length + cohortLost.length;
      return {
        source: s,
        count: cohort.length,
        wonCount: cohortWon.length,
        winRate: cohortClosed ? Math.round((cohortWon.length / cohortClosed) * 100) : null,
      };
    }).filter((r) => r.count > 0);
  }, [created]);

  // ── section 4: by segment (ignores the segment filter on purpose) ──
  const bySegment = useMemo(() => {
    const all = deals.filter((d) => !d.archived);
    return SEGMENTS.map((seg) => {
      const w = all.filter((d) => d.segment === seg && inRange(d.won_at, from, to));
      const l = all.filter((d) => d.segment === seg && d.stage === 'lost' && inRange(d.lost_at, from, to));
      const c = all.filter((d) => d.segment === seg && inRange(d.created_at, from, to));
      const cl = w.length + l.length;
      return {
        segment: seg,
        wonCount: w.length,
        wonValue: w.reduce((n, d) => n + d.value, 0),
        leads: c.length,
        winRate: cl ? Math.round((w.length / cl) * 100) : null,
      };
    }).filter((r) => r.wonCount || r.leads);
  }, [deals, from, to]);

  // ── section 5: monthly trend ───────────────────────────────────────
  const months = useMemo(() => monthsBetween(from, to), [from, to]);
  const trend = useMemo(
    () =>
      months.map((m) => ({
        month: m,
        leads: created.filter((d) => easternMonth(d.created_at) === m).length,
        wonValue: won.filter((d) => d.won_at && easternMonth(d.won_at) === m).reduce((n, d) => n + d.value, 0),
      })),
    [months, created, won]
  );

  // ── section 6: stage entries per month + current snapshot ──────────
  const stageMatrix = useMemo(
    () =>
      months.map((m) => {
        const row: Record<string, number | string> = { month: m };
        for (const st of STAGES) {
          row[st] = liveEntries.filter(
            (e) => e.to_stage === st && easternMonth(e.changed_at) === m
          ).length;
        }
        return row;
      }),
    [months, liveEntries]
  );
  const snapshot = useMemo(
    () => STAGES.map((st) => ({ stage: st, count: live.filter((d) => d.stage === st).length })),
    [live]
  );

  // ── CSV export ─────────────────────────────────────────────────────
  const rangeSlug = preset === 'custom' ? `${from}-to-${to}` : preset.replace('_', '-');
  const download = (name: string, csv: string) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const csvSections = (): [string, string][] => [
    ['Headline', toCsv(
      ['metric', 'value'],
      [
        ['leads created', String(created.length)],
        ['deals won', String(won.length)],
        ['won value', String(wonValue)],
        ['average won deal', String(won.length ? Math.round(wonValue / won.length) : 0)],
        ['win rate %', winRate === null ? '' : String(winRate)],
      ]
    )],
    ['Won value by source', toCsv(
      ['source', 'source detail', 'won count', 'won value'],
      wonBySource.flatMap((b) => [
        [SOURCE_LABEL[b.source], '(all)', String(b.count), String(b.value)],
        ...b.details.map((d) => [SOURCE_LABEL[b.source], d.detail, String(d.count), String(d.value)]),
      ])
    )],
    ['Leads by source', toCsv(
      ['source', 'leads created', 'won from cohort', 'win rate %'],
      leadsBySource.map((r) => [SOURCE_LABEL[r.source], String(r.count), String(r.wonCount), r.winRate === null ? '' : String(r.winRate)])
    )],
    ['By segment', toCsv(
      ['segment', 'won count', 'won value', 'leads created', 'win rate %'],
      bySegment.map((r) => [SEGMENT_META[r.segment].label, String(r.wonCount), String(r.wonValue), String(r.leads), r.winRate === null ? '' : String(r.winRate)])
    )],
    ['Monthly trend', toCsv(
      ['month', 'leads created', 'won value'],
      trend.map((r) => [r.month, String(r.leads), String(r.wonValue)])
    )],
    ['Stage entries per month', toCsv(
      ['month', ...STAGES.map((s) => STAGE_META[s].label)],
      stageMatrix.map((r) => [String(r.month), ...STAGES.map((s) => String(r[s]))])
    )],
  ];
  const exportFull = () => {
    const body = csvSections()
      .map(([title, csv]) => `# ${title} (${from} to ${to}${segment ? `, ${SEGMENT_META[segment].label}` : ''})\n${csv}`)
      .join('\n\n');
    download(`pfcs-report-${rangeSlug}.csv`, body);
  };

  if (isLoading) return <p className="text-sm text-brand-steel">Loading…</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-brand-black">Reports</h1>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={exportFull}>
          <Download className="mr-1.5 h-4 w-4" /> Export full report
        </Button>
      </div>

      {/* range + segment controls */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select value={preset} onValueChange={(v) => setParam('range', v)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p} value={p}>{PRESET_LABEL[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {preset === 'custom' && (
          <>
            <Input type="date" className="w-40" value={from} onChange={(e) => setParam('from', e.target.value)} />
            <span className="text-brand-steel">→</span>
            <Input type="date" className="w-40" value={to} onChange={(e) => setParam('to', e.target.value)} />
          </>
        )}
        <span className="text-xs text-brand-steel">{from} → {to} (Eastern)</span>
        <div className="flex-1" />
        <button
          onClick={() => setParam('segment', null)}
          className={chip(!segment)}
        >
          All
        </button>
        {SEGMENTS.map((s) => (
          <button key={s} onClick={() => setParam('segment', segment === s ? null : s)} className={chip(segment === s)}>
            {SEGMENT_META[s].short}
          </button>
        ))}
      </div>

      {/* 1 · headline */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Leads created" value={String(created.length)} />
        <Stat label="Deals won" value={String(won.length)} />
        <Stat label="Won value" value={formatDollars(wonValue)} accent />
        <Stat label="Avg won deal" value={won.length ? formatDollars(wonValue / won.length) : '—'} />
        <Stat label="Win rate (closed in period)" value={winRate === null ? '—' : `${winRate}%`} />
      </div>

      {/* 2 · won by source */}
      <Section
        title="Won value by referral source"
        onExport={() => download(`pfcs-report-${rangeSlug}-won-by-source.csv`, csvSections()[1][1])}
      >
        {wonBySource.length === 0 ? (
          <Empty text="No deals won in this period yet." />
        ) : (
          <WonBySourceTable rows={wonBySource} total={wonValue} />
        )}
      </Section>

      {/* 3 · leads by source */}
      <Section
        title="Leads by referral source"
        onExport={() => download(`pfcs-report-${rangeSlug}-leads-by-source.csv`, csvSections()[2][1])}
      >
        {leadsBySource.length === 0 ? (
          <Empty text="No leads created in this period." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-brand-steel">
                <th className="py-1.5">Source</th>
                <th className="py-1.5 text-right">Leads</th>
                <th className="py-1.5 text-right">Won (from these)</th>
                <th className="py-1.5 text-right">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {leadsBySource.map((r) => (
                <tr key={r.source} className="border-b last:border-b-0">
                  <td className="py-1.5">{SOURCE_LABEL[r.source]}</td>
                  <td className="py-1.5 text-right">{r.count}</td>
                  <td className="py-1.5 text-right">{r.wonCount}</td>
                  <td className="py-1.5 text-right">{r.winRate === null ? '—' : `${r.winRate}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* 4 · by segment */}
      <Section
        title="By segment"
        note={segment ? 'Shows all segments regardless of the filter above.' : undefined}
        onExport={() => download(`pfcs-report-${rangeSlug}-by-segment.csv`, csvSections()[3][1])}
      >
        {bySegment.length === 0 ? (
          <Empty text="Nothing in this period." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-brand-steel">
                <th className="py-1.5">Segment</th>
                <th className="py-1.5 text-right">Won</th>
                <th className="py-1.5 text-right">Won $</th>
                <th className="py-1.5 text-right">Leads</th>
                <th className="py-1.5 text-right">Win rate</th>
              </tr>
            </thead>
            <tbody>
              {bySegment.map((r) => (
                <tr key={r.segment} className="border-b last:border-b-0">
                  <td className="py-1.5">{SEGMENT_META[r.segment].label}</td>
                  <td className="py-1.5 text-right">{r.wonCount}</td>
                  <td className="py-1.5 text-right">{formatDollars(r.wonValue)}</td>
                  <td className="py-1.5 text-right">{r.leads}</td>
                  <td className="py-1.5 text-right">{r.winRate === null ? '—' : `${r.winRate}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* 5 · monthly trend */}
      <Section
        title="Monthly trend"
        onExport={() => download(`pfcs-report-${rangeSlug}-trend.csv`, csvSections()[4][1])}
      >
        {trend.every((t) => !t.leads && !t.wonValue) ? (
          <Empty text="Nothing to chart in this period yet." />
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trend} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="l" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="r" orientation="right" tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value, name) =>
                    name === 'Won $' && typeof value === 'number' ? formatDollars(value) : value
                  }
                />
                <Legend />
                <Bar yAxisId="l" dataKey="leads" name="Leads created" fill={STEEL} radius={[3, 3, 0, 0]} />
                <Bar yAxisId="r" dataKey="wonValue" name="Won $" fill={ORANGE} radius={[3, 3, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* 6 · stage counts over time + snapshot */}
      <Section
        title="Stage entries per month"
        note="How many deals ENTERED each stage that month (from stage history)."
        onExport={() => download(`pfcs-report-${rangeSlug}-stages.csv`, csvSections()[5][1])}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-brand-steel">
                <th className="py-1.5">Month</th>
                {STAGES.map((s) => (
                  <th key={s} className="py-1.5 text-right">{STAGE_META[s].label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stageMatrix.map((r) => (
                <tr key={String(r.month)} className="border-b last:border-b-0">
                  <td className="py-1.5">{String(r.month)}</td>
                  {STAGES.map((s) => (
                    <td key={s} className={cn('py-1.5 text-right', !r[s] && 'text-brand-steel/40')}>{String(r[s])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Current pipeline snapshot">
        <table className="w-full max-w-md text-sm">
          <tbody>
            {snapshot.map((r) => (
              <tr key={r.stage} className="border-b last:border-b-0">
                <td className="py-1.5">{STAGE_META[r.stage].label}</td>
                <td className="py-1.5 text-right">{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <p className="mt-6 text-xs text-brand-steel">
        Definitions: a deal counts as won/lost by the date it entered that stage (Eastern time).
        Win rate = won ÷ (won + lost) closed in the period; per-source win rate uses the cohort
        of leads created in the period. Archived contacts are excluded everywhere.
      </p>
    </div>
  );
}

// ── helpers & subcomponents ──────────────────────────────────────────

interface SourceBucket {
  source: (typeof SOURCES)[number];
  count: number;
  value: number;
  details: { detail: string; count: number; value: number }[];
}

function groupBySource(dealsWon: ReportDeal[]): SourceBucket[] {
  return SOURCES.map((s) => {
    const rows = dealsWon.filter((d) => d.source === s);
    const byDetail = new Map<string, { count: number; value: number }>();
    for (const d of rows) {
      const key = d.source_detail?.trim() || '—';
      const cur = byDetail.get(key) ?? { count: 0, value: 0 };
      byDetail.set(key, { count: cur.count + 1, value: cur.value + d.value });
    }
    return {
      source: s,
      count: rows.length,
      value: rows.reduce((n, d) => n + d.value, 0),
      details: [...byDetail.entries()]
        .map(([detail, v]) => ({ detail, ...v }))
        .sort((a, b) => b.value - a.value),
    };
  })
    .filter((b) => b.count > 0)
    .sort((a, b) => b.value - a.value);
}

function WonBySourceTable({ rows, total }: { rows: SourceBucket[]; total: number }) {
  const [openSource, setOpenSource] = useState<string | null>(null);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-left text-xs uppercase tracking-wide text-brand-steel">
          <th className="py-1.5">Source</th>
          <th className="py-1.5 text-right">Won</th>
          <th className="py-1.5 text-right">Won $</th>
          <th className="py-1.5 text-right">Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((b) => (
          <>
            <tr
              key={b.source}
              className="cursor-pointer border-b hover:bg-brand-gray-bg"
              onClick={() => setOpenSource(openSource === b.source ? null : b.source)}
            >
              <td className="py-1.5 font-medium">
                {openSource === b.source ? (
                  <ChevronDown className="mr-1 inline h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="mr-1 inline h-3.5 w-3.5" />
                )}
                {SOURCE_LABEL[b.source]}
              </td>
              <td className="py-1.5 text-right">{b.count}</td>
              <td className="py-1.5 text-right font-medium">{formatDollars(b.value)}</td>
              <td className="py-1.5 text-right">{total ? Math.round((b.value / total) * 100) : 0}%</td>
            </tr>
            {openSource === b.source &&
              b.details.map((d) => (
                <tr key={`${b.source}-${d.detail}`} className="border-b bg-brand-gray-bg/50 text-xs">
                  <td className="py-1 pl-8 text-brand-steel">{d.detail}</td>
                  <td className="py-1 text-right">{d.count}</td>
                  <td className="py-1 text-right">{formatDollars(d.value)}</td>
                  <td className="py-1 text-right text-brand-steel">
                    {total ? Math.round((d.value / total) * 100) : 0}%
                  </td>
                </tr>
              ))}
          </>
        ))}
      </tbody>
    </table>
  );
}

function Section({
  title,
  note,
  onExport,
  children,
}: {
  title: string;
  note?: string;
  onExport?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-brand-black">{title}</h2>
        {note && <span className="text-xs text-brand-steel">{note}</span>}
        <div className="flex-1" />
        {onExport && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onExport}>
            <Download className="mr-1 h-3 w-3" /> CSV
          </Button>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-lg border bg-white p-3 shadow-sm', accent && 'border-brand-orange/40 bg-brand-orange/5')}>
      <div className={cn('text-lg font-bold', accent ? 'text-brand-orange' : 'text-brand-black')}>{value}</div>
      <div className="text-xs text-brand-steel">{label}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-4 text-sm text-brand-steel">{text}</p>;
}

const chip = (active: boolean) =>
  cn(
    'rounded-full border px-2.5 py-1 text-xs font-medium',
    active
      ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
      : 'border-gray-200 bg-white text-brand-steel hover:bg-brand-gray-bg'
  );

function toCsv(header: string[], rows: string[][]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
}
