import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

interface ApplePaySetupGuideProps {
  visible: boolean;
  onClose: () => void;
  deepLinkURL: string;
}

const STEPS = [
  {
    number: '1',
    title: 'Open Shortcuts app',
    description: 'Open the Apple Shortcuts app on your iPhone',
    icon: 'apps-outline',
    color: '#007AFF',
    bg: '#E3F2FD',
  },
  {
    number: '2',
    title: 'Create new Automation',
    description: 'Tap Automation tab → tap + → Choose "Apple Pay" as trigger',
    icon: 'flash-outline',
    color: '#FF9500',
    bg: '#FFF3CD',
  },
  {
    number: '3',
    title: 'Select a payment method',
    description: 'Choose any card, or "Any Payment Method" to catch all transactions',
    icon: 'card-outline',
    color: '#34C759',
    bg: '#E8F5E9',
  },
  {
    number: '4',
    title: 'Add "Open URL" action',
    description: 'Search for "Open URL" action and paste the URL below — the app opens pre-filled with the amount',
    icon: 'link-outline',
    color: '#8B5CF6',
    bg: '#F3E8FF',
  },
  {
    number: '5',
    title: "Run & you're done!",
    description: 'Next Apple Pay transaction will auto-open the Add Expense screen with amount pre-filled',
    icon: 'checkmark-circle-outline',
    color: '#007AFF',
    bg: '#E3F2FD',
  },
];

export function ApplePaySetupGuide({ visible, onClose, deepLinkURL }: ApplePaySetupGuideProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const Clipboard = await import('expo-clipboard');
      await Clipboard.setStringAsync(deepLinkURL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        {/* Header */}
        <LinearGradient colors={['#1C1C1E', '#2C2C2E']} style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Apple Pay Auto-Detect</Text>
            <View style={{ width: 36 }} />
          </View>

          {/* Hero illustration */}
          <View style={styles.heroRow}>
            <View style={styles.applePayBubble}>
              <Text style={styles.applePayText}>  Pay</Text>
            </View>
            <View style={styles.arrowBubble}>
              <Ionicons name="arrow-forward" size={18} color="#8E8E93" />
            </View>
            <View style={styles.appBubble}>
              <Text style={styles.appBubbleEmoji}>💰</Text>
              <Text style={styles.appBubbleText}>Auto-fill</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>Log expenses automatically</Text>
          <Text style={styles.heroSubtitle}>
            When you pay with Apple Pay, the app opens instantly with the amount pre-filled — just confirm and save.
          </Text>
        </LinearGradient>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Steps */}
          <Text style={styles.sectionLabel}>Setup Guide (5 minutes)</Text>

          {STEPS.map((step, index) => (
            <View key={step.number} style={styles.stepRow}>
              <View style={styles.stepLeft}>
                <View style={[styles.stepIconBg, { backgroundColor: step.bg }]}>
                  <Ionicons name={step.icon as any} size={20} color={step.color} />
                </View>
                {index < STEPS.length - 1 && <View style={styles.stepLine} />}
              </View>
              <View style={styles.stepContent}>
                <View style={styles.stepNumRow}>
                  <View style={[styles.stepNumBadge, { backgroundColor: step.color }]}>
                    <Text style={styles.stepNum}>{step.number}</Text>
                  </View>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                </View>
                <Text style={styles.stepDesc}>{step.description}</Text>
              </View>
            </View>
          ))}

          {/* URL to copy */}
          <View style={styles.urlCard}>
            <View style={styles.urlCardHeader}>
              <Ionicons name="link" size={16} color="#007AFF" />
              <Text style={styles.urlCardTitle}>Your Shortcut URL</Text>
            </View>
            <Text style={styles.urlText} numberOfLines={2}>{deepLinkURL}</Text>
            <TouchableOpacity
              style={[styles.copyBtn, copied && styles.copyBtnDone]}
              onPress={handleCopy}
              activeOpacity={0.8}
            >
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color="#FFF" />
              <Text style={styles.copyBtnText}>{copied ? 'Copied!' : 'Copy URL'}</Text>
            </TouchableOpacity>
          </View>

          {/* Back Tap tip */}
          {Platform.OS === 'ios' && (
            <View style={styles.tipCard}>
              <View style={styles.tipHeader}>
                <Text style={{ fontSize: 20 }}>💡</Text>
                <Text style={styles.tipTitle}>Pro Tip: Use Back Tap</Text>
              </View>
              <Text style={styles.tipText}>
                Go to Settings → Accessibility → Touch → Back Tap → Double Tap → choose your "Add Expense" shortcut. Double-tap the back of your iPhone to instantly log a transaction!
              </Text>
            </View>
          )}

          {/* Variables tip */}
          <View style={styles.variablesCard}>
            <Text style={styles.variablesTitle}>📎 URL Parameters</Text>
            <View style={styles.variablesGrid}>
              {[
                { param: 'amount', desc: 'Transaction amount from Apple Pay' },
                { param: 'merchant', desc: 'Store / merchant name' },
                { param: 'category', desc: 'Matches app category name' },
                { param: 'account', desc: 'Pre-selects payment account' },
              ].map(v => (
                <View key={v.param} style={styles.variableRow}>
                  <View style={styles.variableChip}>
                    <Text style={styles.variableParam}>{v.param}</Text>
                  </View>
                  <Text style={styles.variableDesc}>{v.desc}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.variablesNote}>
              In Shortcuts, use "Shortcut Input" variable for amount/merchant to auto-fill from Apple Pay.
            </Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Open Shortcuts Button (iOS only) */}
        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            style={styles.openShortcutsBtn}
            onPress={() => {
              import('expo-linking').then(Linking => {
                Linking.openURL('shortcuts://create-shortcut').catch(() =>
                  Linking.openURL('https://apps.apple.com/app/shortcuts/id915249334')
                );
              });
            }}
          >
            <Ionicons name="share-outline" size={20} color="#FFF" />
            <Text style={styles.openShortcutsBtnText}>Open Shortcuts App</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.openShortcutsBtn} onPress={onClose}>
            <Text style={styles.openShortcutsBtnText}>Got it!</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F8FA',
  },
  header: {
    paddingTop: 20,
    paddingBottom: 28,
    paddingHorizontal: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  applePayBubble: {
    backgroundColor: '#000',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  applePayText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: -0.5,
  },
  arrowBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3A3A3C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  appBubble: {
    backgroundColor: '#007AFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  appBubbleEmoji: {
    fontSize: 20,
  },
  appBubbleText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
    marginTop: 2,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 10,
  },
  heroSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
  },
  scroll: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 12,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 4,
  },
  stepLeft: {
    alignItems: 'center',
    width: 44,
  },
  stepIconBg: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 4,
    minHeight: 16,
  },
  stepContent: {
    flex: 1,
    paddingBottom: 20,
  },
  stepNumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  stepNumBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNum: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFF',
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },
  stepDesc: {
    fontSize: 13,
    color: '#6B6B6B',
    lineHeight: 19,
    marginLeft: 28,
  },
  urlCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: '#E5E5EA',
  },
  urlCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  urlCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#007AFF',
  },
  urlText: {
    fontSize: 12,
    color: '#555',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: '#F8F8FA',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    lineHeight: 18,
  },
  copyBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  copyBtnDone: {
    backgroundColor: '#34C759',
  },
  copyBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  tipCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: '#FCD34D',
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  tipText: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 19,
  },
  variablesCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: '#E5E5EA',
  },
  variablesTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  variablesGrid: {
    gap: 8,
    marginBottom: 10,
  },
  variableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  variableChip: {
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 72,
  },
  variableParam: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  variableDesc: {
    fontSize: 12,
    color: '#6B6B6B',
    flex: 1,
  },
  variablesNote: {
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 18,
    borderTopWidth: 0.5,
    borderTopColor: '#E5E5EA',
    paddingTop: 10,
    marginTop: 4,
  },
  openShortcutsBtn: {
    backgroundColor: '#007AFF',
    margin: 20,
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  openShortcutsBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF',
  },
});
