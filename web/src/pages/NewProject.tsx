import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Rocket } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Input, Select, Textarea } from '../components/ui/Input';
import { api, type Project } from '../lib/api';

const STAGE_OPTIONS = [
  { value: '', label: '— выберите —' },
  { value: 'idea', label: 'Идея' },
  { value: 'mvp', label: 'MVP' },
  { value: 'early_revenue', label: 'Ранняя выручка' },
  { value: 'scaling', label: 'Масштабирование' },
  { value: 'growth', label: 'Рост' },
];

const INVESTOR_OPTIONS = [
  { value: '', label: '— выберите —' },
  { value: 'private', label: 'Частный инвестор' },
  { value: 'fund', label: 'Фонд' },
  { value: 'strategic', label: 'Стратег' },
  { value: 'grant', label: 'Грант' },
];

const LEGAL_OPTIONS = [
  { value: '', label: '— выберите —' },
  { value: 'OOO', label: 'ООО' },
  { value: 'IP', label: 'ИП' },
  { value: 'AO', label: 'АО / ПАО' },
  { value: 'individual', label: 'Физлицо' },
  { value: 'other', label: 'Иное' },
];

export default function NewProject() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    inn: '',
    website: '',
    industry: '',
    legalStatus: '',
    stage: '',
    raiseAmount: '',
    minCheck: '',
    equityOffered: '',
    raiseDeadline: '',
    investorType: '',
    description: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return setErr('Название обязательно');
    setSubmitting(true);
    setErr(null);
    try {
      const res = await api.post<{ project: Project }>('/api/projects', {
        name: form.name.trim(),
        inn: form.inn || null,
        website: form.website || null,
        industry: form.industry || null,
        legalStatus: form.legalStatus || null,
        stage: form.stage || null,
        raiseAmount: form.raiseAmount ? Number(form.raiseAmount) : null,
        minCheck: form.minCheck ? Number(form.minCheck) : null,
        equityOffered: form.equityOffered ? Number(form.equityOffered) : null,
        raiseDeadline: form.raiseDeadline || null,
        investorType: form.investorType || null,
      });
      navigate(`/projects/${res.project.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'create failed');
      setSubmitting(false);
    }
  }

  return (
    <AppLayout
      title="Новый проект"
      action={
        <Button variant="ghost" size="sm" iconLeft={<ArrowLeft size={14} />} onClick={() => navigate(-1)}>
          Назад
        </Button>
      }
    >
      <div className="max-w-readable mx-auto">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-zapusk-400 font-semibold mb-2">
            <Rocket size={12} /> Шаг 1 из 3
          </div>
          <h1 className="text-2xl font-bold text-primary tracking-tight">Старт подготовки материалов</h1>
          <p className="text-sm text-secondary mt-1.5">
            Эти данные сформируют контекст проекта. Чем точнее заполните — тем глубже будет первичный разбор.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Card>
            <CardHeader title="Идентификация" subtitle="Что и кто" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Название проекта"
                required
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Например: Tinkoff Investments AI"
              />
              <Input
                label="ИНН"
                hint="Можно оставить пустым, если юрлицо еще не создано"
                value={form.inn}
                onChange={(e) => set('inn', e.target.value)}
                placeholder="10 или 12 цифр"
              />
              <Input
                label="Сайт"
                type="url"
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
                placeholder="https://"
              />
              <Input
                label="Отрасль"
                value={form.industry}
                onChange={(e) => set('industry', e.target.value)}
                placeholder="Финтех / сервис для бизнеса / маркетплейс / …"
              />
              <Select
                label="Юридический статус"
                value={form.legalStatus}
                onChange={(e) => set('legalStatus', e.target.value)}
                options={LEGAL_OPTIONS}
              />
              <Select label="Стадия" value={form.stage} onChange={(e) => set('stage', e.target.value)} options={STAGE_OPTIONS} />
            </div>
          </Card>

          <Card accent="zapusk">
            <CardHeader title="Сделка" subtitle="Условия для инвестора" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Сколько хотите привлечь, ₽"
                type="number"
                inputMode="numeric"
                value={form.raiseAmount}
                onChange={(e) => set('raiseAmount', e.target.value)}
                placeholder="20 000 000"
              />
              <Input
                label="Минимальный чек инвестора, ₽"
                type="number"
                inputMode="numeric"
                value={form.minCheck}
                onChange={(e) => set('minCheck', e.target.value)}
                placeholder="1 000 000"
              />
              <Input
                label="Доля для инвестора, %"
                type="number"
                inputMode="decimal"
                value={form.equityOffered}
                onChange={(e) => set('equityOffered', e.target.value)}
                placeholder="10"
              />
              <Input
                label="Срок привлечения"
                type="date"
                value={form.raiseDeadline}
                onChange={(e) => set('raiseDeadline', e.target.value)}
              />
              <Select
                label="Тип инвестора"
                value={form.investorType}
                onChange={(e) => set('investorType', e.target.value)}
                options={INVESTOR_OPTIONS}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Контекст проекта" subtitle="Опционально — поможет первому разбору" />
            <Textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={4}
              placeholder="В двух предложениях: что делаете, кому продаёте, как зарабатываете."
            />
          </Card>

          {err && <div className="text-sm text-danger">{err}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => navigate('/dashboard')}>
              Отмена
            </Button>
            <Button type="submit" loading={submitting} size="lg" iconLeft={<Rocket size={14} />}>
              Создать и перейти к загрузке материалов
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
