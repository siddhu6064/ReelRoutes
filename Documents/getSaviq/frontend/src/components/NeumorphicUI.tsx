import React from 'react';
import { View, StyleSheet, ViewStyle, Platform, TouchableOpacity, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Light Neumorphic Theme Colors
export const lightTheme = {
  colors: {
    background: '#F2F2F7',
    cardBackground: '#FFFFFF',
    primary: '#7F52FF',
    primaryLight: '#EDE7FF',
    primaryDark: '#6B42E0',
    secondary: '#8E8E93',
    success: '#34C759',
    warning: '#FF9500',
    danger: '#FF3B30',
    text: '#000000',
    textSecondary: '#3C3C43',
    textTertiary: '#8E8E93',
    placeholder: '#C7C7CC',
    border: '#E5E5EA',
    divider: '#C6C6C8',
    inputBackground: '#FFFFFF',
    toggleInactive: '#E5E5EA',
    // Category colors
    teal: '#5AC8FA',
    purple: '#AF52DE',
    blue: '#007AFF',
    green: '#34C759',
    yellow: '#FFCC00',
    orange: '#FF9500',
    red: '#FF3B30',
    pink: '#FF2D55',
  },
  shadows: {
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    cardPressed: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    button: {
      shadowColor: '#7F52FF',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 9999,
  },
};

// Neumorphic Card Component
interface NeumorphicCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  noPadding?: boolean;
}

export function NeumorphicCard({ children, style, noPadding = false }: NeumorphicCardProps) {
  return (
    <View style={[
      styles.card,
      !noPadding && styles.cardPadding,
      lightTheme.shadows.card,
      style
    ]}>
      {children}
    </View>
  );
}

// Segmented Control (Expense/Income/Transfer tabs)
interface SegmentedControlProps {
  options: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function SegmentedControl({ options, selectedIndex, onSelect }: SegmentedControlProps) {
  return (
    <View style={styles.segmentedContainer}>
      <LinearGradient
        colors={['#EDE7FF', '#F5F0FF']}
        style={styles.segmentedBackground}
      >
        {options.map((option, index) => (
          <TouchableOpacity
            key={option}
            style={[
              styles.segmentOption,
              selectedIndex === index && styles.segmentOptionSelected,
            ]}
            onPress={() => onSelect(index)}
            activeOpacity={0.7}
          >
            {selectedIndex === index ? (
              <LinearGradient
                colors={['#7F52FF', '#9B7BFF']}
                style={styles.segmentGradient}
              >
                <Text style={styles.segmentTextSelected}>{option}</Text>
              </LinearGradient>
            ) : (
              <Text style={styles.segmentText}>{option}</Text>
            )}
          </TouchableOpacity>
        ))}
      </LinearGradient>
    </View>
  );
}

// List Item Row
interface ListItemRowProps {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
  showArrow?: boolean;
  rightElement?: React.ReactNode;
}

export function ListItemRow({ icon, label, value, onPress, showArrow = true, rightElement }: ListItemRowProps) {
  const Container = onPress ? TouchableOpacity : View;
  
  return (
    <Container 
      style={styles.listItemRow}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.listItemLeft}>
        <View style={styles.listItemIcon}>{icon}</View>
        <Text style={styles.listItemLabel}>{label}</Text>
      </View>
      <View style={styles.listItemRight}>
        {value && <Text style={styles.listItemValue}>{value}</Text>}
        {rightElement}
        {showArrow && onPress && (
          <Text style={styles.listItemArrow}>›</Text>
        )}
      </View>
    </Container>
  );
}

// Toggle Switch
interface ToggleSwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function ToggleSwitch({ value, onValueChange }: ToggleSwitchProps) {
  return (
    <TouchableOpacity
      style={[styles.toggleTrack, value && styles.toggleTrackActive]}
      onPress={() => onValueChange(!value)}
      activeOpacity={0.8}
    >
      <View style={[styles.toggleThumb, value && styles.toggleThumbActive]} />
    </TouchableOpacity>
  );
}

// Primary Button
interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

export function PrimaryButton({ title, onPress, disabled = false, variant = 'primary' }: PrimaryButtonProps) {
  const getColors = () => {
    if (disabled) return ['#C7C7CC', '#B0B0B5'];
    switch (variant) {
      case 'danger': return ['#FF3B30', '#E8352B'];
      case 'secondary': return ['#E5E5EA', '#D1D1D6'];
      default: return ['#7F52FF', '#6B42E0'];
    }
  };

  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8}>
      <LinearGradient
        colors={getColors()}
        style={[styles.primaryButton, disabled && styles.primaryButtonDisabled]}
      >
        <Text style={[
          styles.primaryButtonText,
          variant === 'secondary' && styles.primaryButtonTextSecondary
        ]}>
          {title}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// Text Link Button
interface TextLinkButtonProps {
  title: string;
  onPress: () => void;
  icon?: React.ReactNode;
}

export function TextLinkButton({ title, onPress, icon }: TextLinkButtonProps) {
  return (
    <TouchableOpacity style={styles.textLinkButton} onPress={onPress} activeOpacity={0.6}>
      {icon}
      <Text style={styles.textLinkButtonText}>{title}</Text>
    </TouchableOpacity>
  );
}

// Section Header
interface SectionHeaderProps {
  title: string;
}

export function SectionHeader({ title }: SectionHeaderProps) {
  return (
    <Text style={styles.sectionHeader}>{title}</Text>
  );
}

// Divider
export function Divider() {
  return <View style={styles.divider} />;
}

// Category Icon Badge
interface CategoryBadgeProps {
  icon: React.ReactNode;
  color: string;
  size?: 'sm' | 'md' | 'lg';
}

export function CategoryBadge({ icon, color, size = 'md' }: CategoryBadgeProps) {
  const sizes = { sm: 32, md: 40, lg: 48 };
  const iconSize = sizes[size];
  
  return (
    <View style={[
      styles.categoryBadge,
      { 
        width: iconSize, 
        height: iconSize, 
        borderRadius: iconSize / 2,
        backgroundColor: color + '20',
      }
    ]}>
      {icon}
    </View>
  );
}

const styles = StyleSheet.create({
  // Card
  card: {
    backgroundColor: lightTheme.colors.cardBackground,
    borderRadius: lightTheme.borderRadius.lg,
    overflow: 'hidden',
  },
  cardPadding: {
    padding: 16,
  },

  // Segmented Control
  segmentedContainer: {
    borderRadius: lightTheme.borderRadius.lg,
    overflow: 'hidden',
  },
  segmentedBackground: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: lightTheme.borderRadius.lg,
  },
  segmentOption: {
    flex: 1,
    borderRadius: lightTheme.borderRadius.md,
    overflow: 'hidden',
  },
  segmentOptionSelected: {
    ...lightTheme.shadows.button,
  },
  segmentGradient: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderRadius: lightTheme.borderRadius.md,
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '600',
    color: lightTheme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  segmentTextSelected: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // List Item Row
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listItemIcon: {
    width: 24,
    alignItems: 'center',
  },
  listItemLabel: {
    fontSize: 16,
    color: lightTheme.colors.text,
  },
  listItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  listItemValue: {
    fontSize: 16,
    color: lightTheme.colors.textTertiary,
  },
  listItemArrow: {
    fontSize: 20,
    color: lightTheme.colors.placeholder,
    fontWeight: '300',
  },

  // Toggle Switch
  toggleTrack: {
    width: 51,
    height: 31,
    borderRadius: 15.5,
    backgroundColor: lightTheme.colors.toggleInactive,
    justifyContent: 'center',
    padding: 2,
  },
  toggleTrackActive: {
    backgroundColor: lightTheme.colors.primary,
  },
  toggleThumb: {
    width: 27,
    height: 27,
    borderRadius: 13.5,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },

  // Primary Button
  primaryButton: {
    borderRadius: lightTheme.borderRadius.md,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  primaryButtonTextSecondary: {
    color: lightTheme.colors.text,
  },

  // Text Link Button
  textLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  textLinkButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: lightTheme.colors.primary,
  },

  // Section Header
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: lightTheme.colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: lightTheme.colors.divider,
    marginLeft: 52,
  },

  // Category Badge
  categoryBadge: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
