// Re-export shared utilities
export {
  formatCurrency,
  formatDate,
  formatShortDate,
  formatTime,
  calculatePercentage,
  getInitials,
  groupByDate,
} from '@shared/utils';

export {
  CATEGORY_ICON_MAP as SHARED_CATEGORY_ICON_MAP,
  CATEGORY_COLORS,
  PAYMENT_TYPES,
  TRANSACTION_COLORS,
  THEME,
} from '@shared/constants';

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Utensils, Car, ShoppingCart, Zap, Film, HeartPulse, Plane, GraduationCap, MoreHorizontal, Tag, Home, Wallet, CreditCard, Banknote, Building2 } from 'lucide-react';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const ICON_COMPONENTS = { Utensils, Car, ShoppingCart, Zap, Film, HeartPulse, Plane, GraduationCap, MoreHorizontal, Tag, Home, Wallet, CreditCard, Banknote, Building2 };
const ICON_NAME_MAP = { restaurant:'Utensils', car:'Car', cart:'ShoppingCart', flash:'Zap', film:'Film', medical:'HeartPulse', airplane:'Plane', school:'GraduationCap', 'ellipsis-horizontal':'MoreHorizontal', tag:'Tag', home:'Home', wallet:'Wallet', card:'CreditCard', cash:'Banknote', business:'Building2' };
const PAYMENT_ICON_MAP = { cash:'Banknote', credit_card:'CreditCard', debit_card:'CreditCard', bank_transfer:'Building2', other:'Wallet' };

export function getCategoryIcon(iconName) { return ICON_COMPONENTS[ICON_NAME_MAP[iconName] || 'Tag'] || Tag; }
export function getPaymentIcon(type) { return ICON_COMPONENTS[PAYMENT_ICON_MAP[type] || 'Wallet'] || Wallet; }
