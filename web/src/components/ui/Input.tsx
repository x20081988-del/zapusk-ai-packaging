import clsx from 'clsx';
import { forwardRef } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldProps {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, required, className, id, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      <input
        ref={ref}
        id={inputId}
        className={clsx(
          'w-full h-10 px-3.5 bg-canvas border border-line rounded-md text-sm text-primary placeholder:text-faint',
          'transition-colors focus:outline-none focus:border-zapusk/60 focus:bg-ink',
          error && 'border-danger/60',
          className,
        )}
        {...rest}
      />
    </Field>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, required, className, id, rows = 4, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        className={clsx(
          'w-full px-3.5 py-2.5 bg-canvas border border-line rounded-md text-sm text-primary placeholder:text-faint resize-y',
          'transition-colors focus:outline-none focus:border-zapusk/60 focus:bg-ink',
          error && 'border-danger/60',
          className,
        )}
        {...rest}
      />
    </Field>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldProps {
  options: Array<{ value: string; label: string }>;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, required, className, options, id, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId}>
      <select
        ref={ref}
        id={inputId}
        className={clsx(
          'w-full h-10 px-3 bg-canvas border border-line rounded-md text-sm text-primary',
          'transition-colors focus:outline-none focus:border-zapusk/60 focus:bg-ink',
          error && 'border-danger/60',
          className,
        )}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-canvas text-primary">
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
});

function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
}: FieldProps & { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block">
      {label && (
        <span className="block text-xs font-medium text-secondary mb-1.5">
          {label}
          {required && <span className="text-zapusk ml-1">*</span>}
        </span>
      )}
      {children}
      {error ? (
        <span className="block text-xs text-danger mt-1.5">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-muted mt-1.5">{hint}</span>
      ) : null}
    </label>
  );
}
