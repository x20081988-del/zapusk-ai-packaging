import { useState } from 'react';
import { Compass, CheckCircle2, ChevronRight } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { TRACK_OPTIONS } from '../../lib/investmentTrack';
import type { InvestmentTrack } from '../../lib/api';

// Sprint 21 — выбор формата привлечения инвестиций.
// Открывается при первом заходе на проект (если трек не выбран) или по
// кнопке «Сменить формат» в заголовке «Пути привлечения инвестиций».
//
// Радио-список из 6 опций. Каждая — заголовок + короткая подсказка. После
// выбора жмём «Подтвердить и запустить путь» — система перестраивает этапы
// под формат.

interface Props {
  open: boolean;
  current: InvestmentTrack | null;
  saving?: boolean;
  onSave: (track: InvestmentTrack) => Promise<void> | void;
  onClose: () => void;
}

export function TrackPicker({ open, current, saving, onSave, onClose }: Props) {
  const [picked, setPicked] = useState<InvestmentTrack | null>(current);

  function submit() {
    if (!picked) return;
    void onSave(picked);
  }

  return (
    <Modal open={open} onClose={onClose} title="Формат привлечения инвестиций" width="max-w-2xl">
      <div className="p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-md bg-zapusk/15 border border-zapusk/30 text-zapusk-400 flex items-center justify-center shrink-0">
            <Compass size={18} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-primary">Какой формат привлечения инвестиций вам нужен?</h3>
            <p className="text-xs text-secondary mt-1 leading-relaxed">
              Под выбранный формат система автоматически соберёт этапы: юридическую упаковку, материалы,
              работу с инвесторами и сопровождение сделки. Формат можно сменить позже.
            </p>
          </div>
        </div>

        <ul className="space-y-2">
          {TRACK_OPTIONS.map((opt) => {
            const isPicked = picked === opt.id;
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  onClick={() => setPicked(opt.id)}
                  className={`w-full text-left rounded-md border px-4 py-3 transition-all flex items-start gap-3
                    ${isPicked
                      ? 'border-zapusk/40 bg-zapusk/8 shadow-glow'
                      : 'border-hairline bg-canvas/40 hover:border-zapusk/25 hover:bg-canvas/60'}`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 mt-0.5 flex items-center justify-center shrink-0
                    ${isPicked ? 'border-zapusk-400 bg-zapusk-400/10' : 'border-line'}`}>
                    {isPicked && <CheckCircle2 size={13} className="text-zapusk-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-primary">{opt.label}</div>
                    <div className="text-[11px] text-muted mt-0.5 leading-snug">{opt.hint}</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-3 pt-2 border-t border-hairline sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted sm:max-w-[55%]">
            Если ещё не определились — выберите «Только упаковка проекта», и мы соберём материалы без этапа размещения.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={onClose} className="w-full sm:w-auto">Отмена</Button>
            <Button
              variant="primary"
              iconRight={<ChevronRight size={13} />}
              disabled={!picked}
              loading={saving}
              onClick={submit}
              className="w-full whitespace-normal text-center leading-snug sm:w-auto"
            >
              {current ? 'Сохранить формат' : 'Запустить путь привлечения'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
