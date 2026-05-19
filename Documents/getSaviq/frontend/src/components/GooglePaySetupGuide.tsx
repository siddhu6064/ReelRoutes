import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface GooglePaySetupGuideProps {
  visible: boolean;
  onClose: () => void;
  deepLinkURL: string;
}

const TASKER_STEPS = [
  {
    number: '1',
    title: 'Install Tasker',
    description: 'Download Tasker from Google Play Store — the most powerful Android automation app',
    icon: 'logo-google-playstore',
    color: '#34A853',
    bg: '#E8F5E9',
  },
  {
    number: '2',
    title: 'Create a new Profile',
    description: 'Tap + → Event → UI → Notification → set App to "Google Pay" to trigger on every payment',
    icon: 'notifications-outline',
    color: '#4285F4',
    bg: '#E3F2FD',
  },
  {
    number: '3',
    title: 'Add a New Task',
    description: 'Tap New Task → give it a name like "Log Google Pay" → tap the + button to add an action',
    icon: 'add-circle-outline',
    color: '#FF9500',
    bg: '#FFF3CD',
  },
  {
    number: '4',
    title: 'Add "Open URL" action',
    description: 'Action category: App → Open URI → paste the URL below. Use %ntitle to pass merchant name automatically',
    icon: 'link-outline',
    color: '#8B5CF6',
    bg: '#F3E8FF',
  },
  {
    number: '5',
    title: 'Activate the Profile',
    description: 'Back on the Profiles screen, make sure the toggle is ON. Next Google Pay transaction auto-opens Add Expense!',
    icon: 'checkmark-circle-outline',
    color: '#34A853',
    bg: '#E8F5E9',
  },
];

const AUTOMATE_STEPS = [
  {
    number: '1',
    title: 'Install Automate',
    description: 'Download "Automate" by LlamaLab from Google Play Store — free, visual automation',
    icon: 'logo-google-playstore',
    color: '#34A853',
    bg: '#E8F5E9',
  },
  {
    number: '2',
    title: 'Create new Flow',
    description: 'Open Automate → tap + → start building a flow with the visual block editor',
    icon: 'git-branch-outline',
    color: '#4285F4',
    bg: '#E3F2FD',
  },
  {
    number: '3',
    title: 'Add Notification Trigger',
    description: 'Add block: "Notification posted" → set App filter to Google Pay',
    icon: 'notifications-outline',
    color: '#FF9500',
    bg: '#FFF3CD',
  },
  {
    number: '4',
    title: 'Add Open URL block',
    description: 'Connect an "App start" block → set URI to the deep link URL below',
    icon: 'link-outline',
    color: '#8B5CF6',
    bg: '#F3E8FF',
  },
  {
    number: '5',
    title: 'Start the Flow',
    description: 'Tap the play button. Every Google Pay notification now triggers Add Expense!',
    icon: 'checkmark-circle-outline',
    color: '#34A853',
    bg: '#E8F5E9',
  },
];

// Google "G" logo rendered with colored blocks
function GoogleGLogo({ size = 28 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: size * 0.75, fontWeight: '900', color: '#4285F4', lineHeight: size }}>G</Text>
    </View>
  );
}

export function GooglePaySetupGuide({ visible, onClose, deepLinkURL }: GooglePaySetupGuideProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'tasker' | 'automate'>('tasker');

  const steps = activeTab === 'tasker' ? TASKER_STEPS : AUTOMATE_STEPS;

  const handleCopy = async () => {
    try {
      const Clipboard = await import('expo-clipboard');
      await Clipboard.setStringAsync(deepLinkURL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleOpenPlayStore = (appId: string) => {
    import('expo-linking').then(Linking => {
      Linking.openURL(`market://details?id=${appId}`).catch(() =>
        Linking.openURL(`https://play.google.com/store/apps/details?id=${appId}`)
      );
    });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>

        {/* Dark gradient header */}
        <LinearGradient colors={['#0A0A0A', '#1A1A2E']} style={styles.header}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Google Pay Auto-Detect</Text>
            <View style={{ width: 36 }} />
          </View>

          {/* Hero illustration — Google Pay → arrow → Auto-fill */}
          <View style={styles.heroRow}>
            <View style={styles.googlePayBubble}>
              <View style={styles.gCircle}>
                <Text style={styles.gText}>G</Text>
              </View>
              <View style={styles.payTextBlock}>
                <Text style={styles.payLetter}>P</Text>
                <Text style={[styles.payLetter, { color: '#EA4335' }]}>a</Text>
                <Text style={[styles.payLetter, { color: '#FBBC05' }]}>y</Text>
              </View>
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
            When you pay with Google Pay, the app opens instantly with the amount pre-filled — just confirm and save.
          </Text>

          {/* Platform badge */}
          <View style={styles.platformBadge}>
            <Ionicons name="logo-android" size={14} color="#34A853" />
            <Text style={styles.platformBadgeText}>Android only</Text>
          </View>
        </LinearGradient>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Method tabs */}
          <Text style={styles.sectionLabel}>Choose your automation method</Text>
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'tasker' && styles.tabActive]}
              onPress={() => setActiveTab('tasker')}
            >
              <Text style={[styles.tabText, activeTab === 'tasker' && styles.tabTextActive]}>
                Tasker
              </Text>
              <Text style={[styles.tabBadge, activeTab === 'tasker' && { color: '#34A853' }]}>
                Recommended
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'automate' && styles.tabActive]}
              onPress={() => setActiveTab('automate')}
            >
              <Text style={[styles.tabText, activeTab === 'automate' && styles.tabTextActive]}>
                Automate
              </Text>
              <Text style={[styles.tabBadge, activeTab === 'automate' && { color: '#4285F4' }]}>
                Free &amp; Visual
              </Text>
            </TouchableOpacity>
          </View>

          {/* App store shortcut */}
          <TouchableOpacity
            style={styles.playStoreRow}
            onPress={() => handleOpenPlayStore(
              activeTab === 'tasker' ? 'net.dinglisch.android.taskerm' : 'com.llamalab.automate'
            )}
            activeOpacity={0.8}
          >
            <View style={styles.playStoreIcon}>
              <Ionicons name="logo-google-playstore" size={18} color="#34A853" />
            </View>
            <Text style={styles.playStoreText}>
              Get {activeTab === 'tasker' ? 'Tasker' : 'Automate'} on Play Store
            </Text>
            <Ionicons name="open-outline" size={15} color="#8E8E93" />
          </TouchableOpacity>

          {/* Step-by-step guide */}
          <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Setup Guide (5 minutes)</Text>

          {steps.map((step, index) => (
            <View key={step.number} style={styles.stepRow}>
              <View style={styles.stepLeft}>
                <View style={[styles.stepIconBg, { backgroundColor: step.bg }]}>
                  <Ionicons name={step.icon as any} size={20} color={step.color} />
                </View>
                {index < steps.length - 1 && <View style={styles.stepLine} />}
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
              <Ionicons name="link" size={16} color="#4285F4" />
              <Text style={[styles.urlCardTitle, { color: '#4285F4' }]}>Your Deep Link URL</Text>
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

          {/* Tasker-specific Tasker variables tip */}
          {activeTab === 'tasker' && (
            <View style={styles.tipCard}>
              <View style={styles.tipHeader}>
                <Text style={{ fontSize: 20 }}>⚡</Text>
                <Text style={styles.tipTitle}>Tasker Variables</Text>
              </View>
              <Text style={styles.tipText}>
                In the Open URI action, use <Text style={styles.codeText}>%ntitle</Text> for the notification title (merchant name) and <Text style={styles.codeText}>%ntext</Text> for the amount. Tasker passes these automatically from the Google Pay notification.
              </Text>
            </View>
          )}

          {/* Android Quick Tile tip */}
          <View style={styles.tipCard}>
            <View style={styles.tipHeader}>
              <Text style={{ fontSize: 20 }}>💡</Text>
              <Text style={styles.tipTitle}>Pro Tip: Quick Settings Tile</Text>
            </View>
            <Text style={styles.tipText}>
              In Tasker, add a Quick Settings Tile shortcut that opens the Add Expense screen with one tap — pull down your notification shade and tap the tile instantly.
            </Text>
          </View>

          {/* URL Parameters */}
          <View style={styles.variablesCard}>
            <Text style={styles.variablesTitle}>📎 URL Parameters</Text>
            <View style={styles.variablesGrid}>
              {[
                { param: 'amount',   desc: 'Transaction amount from Google Pay' },
                { param: 'merchant', desc: 'Store / merchant name' },
                { param: 'category', desc: 'Matches app category name' },
                { param: 'account',  desc: 'Pre-selects payment account' },
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
              In Tasker, map <Text style={styles.codeText}>%ntitle</Text> → merchant and <Text style={styles.codeText}>%ntext</Text> → amount to pass real payment data.
            </Text>
          </View>

          {/* Works on all platforms note */}
          <View style={styles.compatCard}>
            <Ionicons name="information-circle-outline" size={16} color="#4285F4" />
            <Text style={styles.compatText}>
              This setup works on <Text style={{ fontWeight: '700' }}>any Android device</Text> running Google Pay. The deep link works across iOS, Android, and web — the same URL scheme is used for Apple Pay Shortcuts too.
            </Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* CTA button */}
        {Platform.OS === 'android' ? (
          <TouchableOpacity
            style={styles.openStoreBtn}
            onPress={() => handleOpenPlayStore(
              activeTab === 'tasker' ? 'net.dinglisch.android.taskerm' : 'com.llamalab.automate'
            )}
            activeOpacity={0.9}
          >
            <Ionicons name="logo-google-playstore" size={20} color="#FFF" />
            <Text style={styles.openStoreBtnText}>
              Open {activeTab === 'tasker' ? 'Tasker' : 'Automate'} on Play Store
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.openStoreBtn} onPress={onClose}>
            <Text style={styles.openStoreBtnText}>Got it!</Text>
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
  googlePayBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
  },
  gCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#4285F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFF',
  },
  payTextBlock: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  payLetter: {
    fontSize: 17,
    fontWeight: '700',
    color: '#5F6368',
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
    backgroundColor: '#34A853',
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
    marginBottom: 14,
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(52,168,83,0.15)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(52,168,83,0.3)',
  },
  platformBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#34A853',
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
  // Method tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#EFEFEF',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    gap: 2,
  },
  tabActive: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  tabTextActive: {
    color: '#000',
  },
  tabBadge: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8E8E93',
  },
  playStoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 0.5,
    borderColor: '#E5E5EA',
  },
  playStoreIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playStoreText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  // Steps
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
  // URL card
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
    backgroundColor: '#4285F4',
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  copyBtnDone: {
    backgroundColor: '#34A853',
  },
  copyBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  // Tip card
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
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    fontSize: 12,
  },
  // Variables card
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
    backgroundColor: '#E8F5E9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 72,
  },
  variableParam: {
    fontSize: 11,
    fontWeight: '700',
    color: '#166534',
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
  // Compat card
  compatCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: '#BFDBFE',
  },
  compatText: {
    fontSize: 13,
    color: '#1E40AF',
    flex: 1,
    lineHeight: 19,
  },
  // Bottom CTA
  openStoreBtn: {
    backgroundColor: '#34A853',
    margin: 20,
    borderRadius: 16,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  openStoreBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF',
  },
});
