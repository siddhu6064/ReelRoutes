import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NeumorphicCard, lightTheme } from '../NeumorphicUI';
import { deriveSmartInsightsState } from '../../utils/aiIntelligenceState';
import { useTheme } from '../../contexts/ThemeContext';

interface SmartInsightItem {
  title?: string;
  message?: string;
  severity?: string;
  type?: string;
}

interface SmartInsightsWidgetProps {
  isLoading: boolean;
  error?: string;
  insights: SmartInsightItem[];
  onPressAskAI?: () => void;
}

function getSeverityColor(severity?: string) {
  if (severity === 'critical' || severity === 'warning' || severity === 'high') {
    return lightTheme.colors.warning;
  }
  if (severity === 'positive') {
    return lightTheme.colors.success;
  }
  return lightTheme.colors.primary;
}

export function SmartInsightsWidget({ isLoading, error, insights, onPressAskAI }: SmartInsightsWidgetProps) {
  const { colors } = useTheme();
  const items = Array.isArray(insights) ? insights.slice(0, 2) : [];
  const viewState = deriveSmartInsightsState({ isLoading, error, insights });

  return (
    <NeumorphicCard style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Ionicons name="bulb-outline" size={18} color={colors.primary} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>Smart Insights</Text>
        </View>
        <TouchableOpacity
          style={[styles.askAiButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
          onPress={onPressAskAI}
          activeOpacity={0.85}
        >
          <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
          <Text style={[styles.askAiButtonText, { color: colors.primary }]}>Ask AI</Text>
        </TouchableOpacity>
      </View>

      {viewState === 'loading' ? (
        <Text style={[styles.helper, { color: colors.textSecondary }]}>Loading insights…</Text>
      ) : viewState === 'error' ? (
        <Text style={[styles.helper, { color: colors.textSecondary }]}>{error}</Text>
      ) : viewState === 'empty' ? (
        <Text style={[styles.helper, { color: colors.textSecondary }]}>Smart insights are waiting for data.</Text>
      ) : (
        <View style={styles.items}>
          {items.map((item, index) => (
            <View key={`${item.type || 'insight'}-${index}`} style={styles.itemRow}>
              <View style={[styles.dot, { backgroundColor: getSeverityColor(item.severity) }]} />
              <View style={styles.itemText}>
                <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>{item.title || 'Insight'}</Text>
                <Text style={[styles.itemBody, { color: colors.textSecondary }]}>{item.message || 'No details available.'}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </NeumorphicCard>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 8 },
  header: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700', color: lightTheme.colors.text },
  askAiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 0.5,
    borderColor: lightTheme.colors.border,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: lightTheme.colors.cardBackground,
  },
  askAiButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: lightTheme.colors.primary,
  },
  helper: { fontSize: 14, color: lightTheme.colors.textTertiary },
  items: { gap: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  itemText: { flex: 1 },
  itemTitle: { fontSize: 13, fontWeight: '700', color: lightTheme.colors.text },
  itemBody: { marginTop: 2, fontSize: 13, lineHeight: 18, color: lightTheme.colors.textSecondary },
});
