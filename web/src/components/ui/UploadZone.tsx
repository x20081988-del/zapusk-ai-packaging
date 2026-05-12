import { useRef, useState } from 'react';
import clsx from 'clsx';
import { UploadCloud } from 'lucide-react';

interface Props {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  accept?: string;
  hint?: string;
}

export function UploadZone({ onFiles, multiple = true, accept, hint }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function handle(files: FileList | null) {
    if (!files) return;
    onFiles(Array.from(files));
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}
      onClick={() => ref.current?.click()}
      className={clsx(
        'relative flex flex-col items-center justify-center gap-2.5 py-10 px-6 border-2 border-dashed rounded-lg cursor-pointer transition-all',
        over ? 'border-zapusk bg-zapusk/5' : 'border-line bg-canvas hover:border-zapusk/50 hover:bg-surface',
      )}
    >
      <div className={clsx('w-12 h-12 rounded-full flex items-center justify-center', over ? 'bg-zapusk/20' : 'bg-surface border border-line')}>
        <UploadCloud size={20} className={over ? 'text-zapusk-400' : 'text-secondary'} />
      </div>
      <div className="text-center">
        <div className="text-sm font-medium text-primary">Перетащите файлы или нажмите для выбора</div>
        <div className="text-xs text-muted mt-1">{hint ?? 'PDF, DOCX, XLSX, PPTX, PNG/JPG · до 50 МБ'}</div>
      </div>
      <input
        ref={ref}
        type="file"
        multiple={multiple}
        accept={accept}
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
    </div>
  );
}
