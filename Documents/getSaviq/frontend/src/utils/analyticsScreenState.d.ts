export function sanitizeAnalyticsPayload(payload: any): {
  summary: {
    net_balance: number;
    total_income: number;
    total_spend: number;
    month_over_month_change_pct: number;
  };
  categoryItems: Array<{ id: string; label: string; fullLabel: string; amount: number; percentage: number }>;
  paymentItems: Array<{ id: string; label: string; fullLabel: string; amount: number }>;
  trendItems: Array<{ id: string; month: string; amount: number }>;
};

export function deriveAnalyticsViewState(input: {
  isLoading: boolean;
  error?: string;
  summary: any;
  categoryItems: any[];
  paymentItems: any[];
  trendItems: any[];
}): 'loading' | 'error' | 'success' | 'empty';
