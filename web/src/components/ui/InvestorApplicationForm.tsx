import { useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input, Textarea, Select } from './Input';
import {
  investorApplications,
  type InvestorCheckRange,
  type InvestorInterest,
} from '../../lib/api';

// Sprint 62.P11 — форма заявки инвестора с витрины /opportunities.
// Заявка летит в /api/investor-applications → персистится → подмешивается в
// demo AI-leads. Доступна инвестору и demo workspace (POST разрешён).
interface Props {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  /** Предзаполнить «цель обращения» — например из конкретной CTA. */
  defaultInterest?: InvestorInterest;
}

const CHECK_OPTIONS: Array<{ value: InvestorCheckRange; label: string }> = [
  { value: '500k_1m', label: '500 тыс – 1 млн ₽' },
  { value: '1m_3m', label: '1–3 млн ₽' },
  { value: '3m_10m', label: '3–10 млн ₽' },
  { value: '10m_plus', label: 'от 10 млн ₽' },
];

const INTEREST_OPTIONS: Array<{ value: InvestorInterest; label: string }> = [
  { value: 'materials', label: 'Получить материалы' },
  { value: 'discuss', label: 'Обсудить сделку' },
  { value: 'invest', label: 'Войти в проект' },
  { value: 'compare', label: 'Сравнить с другими' },
];

export function InvestorApplicationForm({ open, onClose, projectId, projectName, defaultInterest = 'materials' }: Props) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [checkRange, setCheckRange] = useState<InvestorCheckRange>('1m_3m');
  const [interest, setInterest] = useState<InvestorInterest>(defaultInterest);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function reset() {
    setName(''); setContact(''); setEmail(''); setCheckRange('1m_3m');
    setInterest(defaultInterest); setComment(''); setError(null); setDone(null);
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function submit() {
    setError(null);
    if (!name.trim()) return setError('Укажите, как к вам обращаться.');
    if (!contact.trim()) return setError('Укажите телефон или Telegram для связи.');
    setSubmitting(true);
    try {
      const r = await investorApplications.create({
        projectId,
        name: name.trim(),
        contact: contact.trim(),
        email: email.trim() || undefined,
        checkRange,
        interest,
        comment: comment.trim() || undefined,
      });
      setDone(r.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось отправить заявку. Попробуйте позже.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Заявка на инвестицию · ${projectName}`} width="max-w-lg">
      {done ? (
        <div className="p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-success/15 text-success flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 size={26} />
          </div>
          <h3 className="text-base font-semibold text-primary mb-1.5">Заявка отправлена</h3>
          <p className="text-sm text-secondary leading-relaxed max-w-sm mx-auto">{done}</p>
          <Button variant="secondary" className="mt-5" onClick={handleClose}>Закрыть</Button>
        </div>
      ) : (
        <div className="p-5 space-y-3.5">
          <p className="text-xs text-muted leading-relaxed">
            Оставьте контакт — менеджер ZAPUSK AI свяжется с вами, ответит на вопросы и предоставит
            доступ к полному пакету материалов. Заявка ни к чему не обязывает.
          </p>
          <Input label="Как к вам обращаться" required name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" />
          <Input label="Телефон или Telegram" required name="contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="+7 … или @username" />
          <Input label="Email (необязательно)" type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <Select label="Размер чека" name="checkRange" options={CHECK_OPTIONS} value={checkRange} onChange={(e) => setCheckRange(e.target.value as InvestorCheckRange)} />
          <Select label="Цель обращения" name="interest" options={INTEREST_OPTIONS} value={interest} onChange={(e) => setInterest(e.target.value as InvestorInterest)} />
          <Textarea label="Комментарий (необязательно)" name="comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Что важно обсудить?" />
          {error && <div className="text-xs text-danger">{error}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={handleClose} disabled={submitting}>Отмена</Button>
            <Button variant="ai" iconRight={<Send size={14} />} onClick={submit} loading={submitting}>
              Отправить заявку
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
