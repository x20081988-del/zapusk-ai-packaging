import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowLeft, RefreshCw, ShieldCheck, Zap } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { api } from '../lib/api';

interface SplitRow {
  name: string;
  requests: number;
  failures: number;
  fallbackRate: number;
  timeoutRate: number;
  estimatedCostUsd: number;
}

interface ProviderHealth {
  provider: string;
  degraded: boolean;
  reason: string | null;
  degradedUntil: string | null;
  sampleSize: number;
  errorRate: number;
  timeoutRate: number;
}

interface ReliabilityDashboard {
  requests24h: number;
  failures24h: number;
  fallbackRate: number;
  avgLatency: number;
  avgCost: number | null;
  timeoutRate: number;
  providerSplit: SplitRow[];
  featureSplit: SplitRow[];
  topFailingFeatures: Array<{ feature: string; failures: number; requests: number }>;
  topExpensiveFeatures: Array<{ feature: string; estimatedCostUsd: number; requests: number }>;
  providerHealth: ProviderHealth[];
}

export default function AdminAIReliability() {
  const [data, setData] = useState<ReliabilityDashboard | null>(null);
  const [security, setSecurity] = useState<{ passed: boolean; warnings: unknown[]; criticals: unknown[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [dash, scan] = await Promise.all([
        api.get<ReliabilityDashboard>('/api/ai-reliability/dashboard'),
        api.get<{ passed: boolean; warnings: unknown[]; criticals: unknown[] }>('/api/admin/security-scan').catch(() => null),
      ]);
      setData(dash);
      setSecurity(scan);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'load_failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <AppLayout
      title="AI Reliability"
      action={
        <div className="flex items-center gap-2">
          <Link to="/admin">
            <Button size="sm" variant="ghost" iconLeft={<ArrowLeft size={14} />}>Админ-панель</Button>
          </Link>
          <Button size="sm" variant="secondary" iconLeft={<RefreshCw size={14} />} loading={loading} onClick={load}>
            Обновить
          </Button>
        </div>
      }
    >
      {error && (
        <Card padded className="mb-6">
          <div className="flex items-start gap-2 text-warning text-xs">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {error}
          </div>
        </Card>
      )}

      {!data ? (
        <Card padded><div className="text-sm text-muted py-8 text-center">Загрузка AI reliability…</div></Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
            <Metric label="AI-запросы 24ч" value={data.requests24h} />
            <Metric label="Ошибки 24ч" value={data.failures24h} tone={data.failures24h ? 'warning' : 'success'} />
            <Metric label="Fallback" value={`${pct(data.fallbackRate)}%`} tone={data.fallbackRate > 0.2 ? 'warning' : 'success'} />
            <Metric label="Timeout" value={`${pct(data.timeoutRate)}%`} tone={data.timeoutRate > 0.1 ? 'warning' : 'success'} />
            <Metric label="Средняя задержка" value={`${data.avgLatency} ms`} />
            <Metric label="Средняя стоимость" value={data.avgCost == null ? '—' : `$${data.avgCost.toFixed(4)}`} />
          </div>

          <Card padded>
            <CardHeader
              title="Provider health"
              subtitle="In-memory circuit breaker: временная деградация провайдера не отключает его навсегда"
              action={security && (
                <StatusBadge tone={security.passed ? 'success' : 'danger'} dot>
                  DD scan: {security.passed ? 'passed' : `${security.criticals.length} critical`}
                </StatusBadge>
              )}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {data.providerHealth.map((p) => (
                <div key={p.provider} className="rounded-md border border-hairline bg-canvas/45 px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-primary">{p.provider}</div>
                    <StatusBadge tone={p.degraded ? 'danger' : 'success'} dot>
                      {p.degraded ? 'degraded' : 'healthy'}
                    </StatusBadge>
                  </div>
                  <div className="text-xs text-muted mt-2">
                    sample {p.sampleSize} · ошибки {pct(p.errorRate)}% · timeout {pct(p.timeoutRate)}%
                  </div>
                  {p.reason && <div className="text-xs text-warning mt-1">{p.reason}</div>}
                </div>
              ))}
            </div>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <SplitTable title="Provider split" rows={data.providerSplit} />
            <SplitTable title="Feature split" rows={data.featureSplit} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ListCard
              title="Top failing features"
              rows={data.topFailingFeatures.map((r) => `${r.feature}: ${r.failures}/${r.requests}`)}
              icon={<AlertTriangle size={14} />}
            />
            <ListCard
              title="Top expensive features"
              rows={data.topExpensiveFeatures.map((r) => `${r.feature}: $${r.estimatedCostUsd.toFixed(4)} · ${r.requests} запросов`)}
              icon={<Zap size={14} />}
            />
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function pct(v: number): number {
  return Math.round(v * 1000) / 10;
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: 'success' | 'warning' }) {
  const iconTone = tone === 'success' ? 'text-success border-success/30 bg-success/10'
    : tone === 'warning' ? 'text-warning border-warning/30 bg-warning/10'
      : 'text-ai-glow border-ai/30 bg-ai/10';
  return (
    <Card padded>
      <div className={`w-8 h-8 rounded-md border flex items-center justify-center ${iconTone}`}>
        <Activity size={14} />
      </div>
      <div className="text-xl font-bold text-primary mt-3 font-num">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.1em] text-muted font-semibold mt-1">{label}</div>
    </Card>
  );
}

function SplitTable({ title, rows }: { title: string; rows: SplitRow[] }) {
  return (
    <Card padded>
      <CardHeader title={title} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-muted">
              <th className="py-2 pr-3">Название</th>
              <th className="py-2 pr-3">Запросы</th>
              <th className="py-2 pr-3">Ошибки</th>
              <th className="py-2 pr-3">Fallback</th>
              <th className="py-2 pr-3">Timeout</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className="border-t border-hairline">
                <td className="py-2 pr-3 text-primary">{r.name}</td>
                <td className="py-2 pr-3 font-num">{r.requests}</td>
                <td className="py-2 pr-3 font-num">{r.failures}</td>
                <td className="py-2 pr-3 font-num">{pct(r.fallbackRate)}%</td>
                <td className="py-2 pr-3 font-num">{pct(r.timeoutRate)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ListCard({ title, rows, icon }: { title: string; rows: string[]; icon: React.ReactNode }) {
  return (
    <Card padded>
      <CardHeader title={title} action={<span className="text-warning">{icon}</span>} />
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r} className="rounded-md border border-hairline bg-canvas/45 px-3 py-2 text-sm text-secondary">{r}</li>
          ))}
        </ul>
      ) : (
        <div className="rounded-md border border-success/25 bg-success/8 px-3 py-3 text-sm text-success flex items-center gap-2">
          <ShieldCheck size={14} />
          Нет сигналов за период
        </div>
      )}
    </Card>
  );
}
