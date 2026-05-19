import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NeumorphicCard, lightTheme } from '../NeumorphicUI';
import { useTheme } from '../../contexts/ThemeContext';

interface SmartMetricInsightCardProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  accentColor: string;
  isLoading: boolean;
  error?: string;
  metric?: {
    value: string;
    badge: string;
    hasData: boolean;
    helperText: string | null;
    context: string;
  } | null;
  loadingLabel: string;
  emptyLabel: string;
}

export function SmartMetricInsightCard({
  title,
  icon,
  accentColor,
  isLoading,
  error,
  metric,
  loadingLabel,
  emptyLabel,
}: SmartMetricInsightCardProps) {
  const { colors } = useTheme();
  const [showHelperText, setShowHelperText] = React.useState(false);
  const showEmpty = !metric || !metric.hasData;
  const helperText = metric?.helperText || null;

  return (
    <NeumorphicCard style={[styles.card, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name={icon} size={18} color={accentColor} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        </View>
        {helperText ? (
          <TouchableOpacity
            style={[styles.helperButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
            onPress={() => setShowHelperText((prev) => !prev)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Learn more about ${title}`}
          >
            <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.content}>
        {isLoading ? (
          <Text style={[styles.helper, { color: colors.textSecondary }]}>{loadingLabel}</Text>
        ) : error ? (
          <Text style={[styles.helper, { color: colors.textSecondary }]}>{error}</Text>
        ) : showEmpty ? (
          <Text style={[styles.helper, { color: colors.textSecondary }]}>{emptyLabel}</Text>
        ) : (
          <>
            <View style={styles.valueRow}>
              <Text style={[styles.value, { color: accentColor }]}>{metric.value}</Text>
              <Text style={[styles.badge, { color: colors.textSecondary }]}>{metric.badge}</Text>
            </View>
            <Text style={[styles.context, { color: colors.textSecondary }]}>{metric.context}</Text>
          </>
        )}
        {showHelperText && helperText ? <Text style={[styles.helperCaption, { color: colors.textSecondary }]}>{helperText}</Text> : null}
      </View>
    </NeumorphicCard>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: lightTheme.colors.text,
  },
  helperButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: lightTheme.colors.border,
    backgroundColor: lightTheme.colors.cardBackground,
  },
  content: {
    minHeight: 56,
    justifyContent: 'center',
  },
  helper: {
    fontSize: 14,
    color: lightTheme.colors.textTertiary,
  },
  valueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  value: {
    fontSize: 27,
    fontWeight: '800',
  },
  badge: {
    fontSize: 11,
    color: lightTheme.colors.textSecondary,
    fontWeight: '700',
  },
  context: {
    marginTop: 6,
    fontSize: 12,
    color: lightTheme.colors.textTertiary,
  },
  helperCaption: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: lightTheme.colors.textSecondary,
  },
});
