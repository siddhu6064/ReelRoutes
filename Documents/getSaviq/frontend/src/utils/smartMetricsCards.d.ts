interface SmartMetricCardModel {
  title: string;
  value: string;
  badge: string;
  hasData: boolean;
  helperText: string | null;
  context: string;
}

export const SMART_METRIC_HELPERS: {
  savingsScore: string;
  spendVelocity: string;
  financialHealth: string;
  budgetConfidence: string;
  projectedSavings: string;
};

export function mapDashboardSmartMetricCards(payload: any): {
  savingsScore: SmartMetricCardModel;
  spendVelocity: SmartMetricCardModel;
  financialHealth: SmartMetricCardModel;
  topCategorySummary: SmartMetricCardModel;
  budgetConfidence: SmartMetricCardModel;
  projectedSavingsSummary: SmartMetricCardModel;
};
