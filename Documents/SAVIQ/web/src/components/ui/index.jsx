import React from 'react';
import { cn } from '../../lib/utils';

export function Button({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className, 
  disabled,
  ...props 
}) {
  const baseStyles = 'inline-flex items-center justify-center font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const variants = {
    primary: 'bg-brand-primary text-white hover:bg-brand-hover focus:ring-brand-primary/50 shadow-sm hover:shadow-md',
    secondary: 'bg-surface text-text-primary border border-border-color hover:bg-surface-hover focus:ring-brand-primary/30',
    danger: 'bg-expense text-white hover:bg-red-600 focus:ring-expense/50',
    ghost: 'text-text-secondary hover:text-text-primary hover:bg-surface-hover',
    income: 'bg-income text-white hover:bg-green-700 focus:ring-income/50',
    expense: 'bg-expense text-white hover:bg-red-600 focus:ring-expense/50',
  };
  
  const sizes = {
    sm: 'px-3 py-1.5 text-sm rounded-lg',
    md: 'px-5 py-2.5 text-sm rounded-full',
    lg: 'px-6 py-3 text-base rounded-full',
    icon: 'p-2 rounded-lg',
  };

  return (
    <button
      className={cn(
        baseStyles,
        variants[variant],
        sizes[size],
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ children, className, hover = false, ...props }) {
  return (
    <div
      className={cn(
        'bg-white border border-border-color rounded-2xl shadow-sm p-6',
        hover && 'hover:shadow-md hover:border-[#D1CCC2] transition-all duration-200 hover:-translate-y-0.5',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Input({ label, error, className, ...props }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-text-primary">
          {label}
        </label>
      )}
      <input
        className={cn(
          'w-full px-4 py-3 bg-white border border-border-color rounded-lg',
          'text-text-primary placeholder:text-text-secondary/50',
          'focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary',
          'transition-all duration-200',
          error && 'border-expense focus:ring-expense/20 focus:border-expense',
          className
        )}
        {...props}
      />
      {error && <p className="text-sm text-expense">{error}</p>}
    </div>
  );
}

export function Select({ label, error, options, className, ...props }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-text-primary">
          {label}
        </label>
      )}
      <select
        className={cn(
          'w-full px-4 py-3 bg-white border border-border-color rounded-lg',
          'text-text-primary',
          'focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary',
          'transition-all duration-200 appearance-none cursor-pointer',
          'bg-[url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2373716D\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")]',
          'bg-no-repeat bg-[right_1rem_center] bg-[length:1rem]',
          error && 'border-expense',
          className
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="text-sm text-expense">{error}</p>}
    </div>
  );
}

export function Badge({ children, variant = 'default', className, ...props }) {
  const variants = {
    default: 'bg-surface-hover text-text-secondary',
    income: 'bg-income-bg text-income',
    expense: 'bg-expense-bg text-expense',
    transfer: 'bg-transfer-bg text-transfer',
    warning: 'bg-warning/10 text-warning',
  };

  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
      variants[variant],
      className
    )} {...props}>
      {children}
    </span>
  );
}

export function Avatar({ src, name, size = 'md', className }) {
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  const initials = name?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';

  return (
    <div className={cn(
      'rounded-full bg-brand-primary/10 flex items-center justify-center overflow-hidden',
      sizes[size],
      className
    )}>
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span className="font-semibold text-brand-primary">{initials}</span>
      )}
    </div>
  );
}

export function Spinner({ size = 'md', className }) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <svg
      className={cn('animate-spin text-brand-primary', sizes[size], className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  const dialogRef = React.useRef(null);

  React.useLayoutEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    const firstFocusable = dialogRef.current?.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto py-4">
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Modal'}
        className={cn(
          'relative bg-white rounded-2xl shadow-xl p-4 sm:p-6 m-3 sm:m-4 w-full animate-fade-in max-h-[90vh] overflow-y-auto',
          sizes[size]
        )}
      >
        {title && (
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold font-heading text-text-primary">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close modal"
              className="p-2 hover:bg-surface-hover rounded-lg transition-colors"
              data-testid="modal-close"
            >
              <svg className="w-5 h-5 text-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Tabs({ tabs, activeTab, onChange }) {
  return (
    <div className="flex gap-1 p-1 bg-surface-hover rounded-xl">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            'flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200',
            activeTab === tab.value
              ? 'bg-white text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          )}
          data-testid={`tab-${tab.value}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
