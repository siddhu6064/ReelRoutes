export function deriveSmartMetricsViewState(input: {
  isLoading: boolean;
  error?: string;
  cards: any;
}): 'loading' | 'error' | 'success' | 'empty';
