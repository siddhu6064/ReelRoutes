import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal, TextInput, Platform, Switch, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { useAppStore } from '../../src/store/appStore';
import * as Linking from 'expo-linking';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import notificationService, { NotificationSettings, WeeklySettings, WEEK_DAYS } from '../../src/services/notificationService';
import { AutomationOnboardingModal } from '../../src/components/AutomationCard';
import { ApplePaySetupGuide } from '../../src/components/ApplePaySetupGuide';
import { GooglePaySetupGuide } from '../../src/components/GooglePaySetupGuide';
import api, { settingsAPI, exportAPI } from '../../src/services/api';
import {
  buildExportFileName,
  getExportErrorMessage,
  shouldCloseExportModalOnProfileSwitch,
  shouldStartExport,
} from '../../src/utils/exportState';

const CATEGORY_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
];

const PAYMENT_TYPES = [
  { type: 'cash', label: 'Cash', icon: 'cash' },
  { type: 'credit_card', label: 'Credit Card', icon: 'card' },
  { type: 'debit_card', label: 'Debit Card', icon: 'card-outline' },
  { type: 'bank_transfer', label: 'Bank Transfer', icon: 'business' },
  { type: 'other', label: 'Other', icon: 'wallet' },
];

export default function MoreScreen() {
  const { user, signOut, isGuestMode } = useAuth();
  const {
    profiles, activeProfile, setActiveProfile, fetchExpenses, fetchSummary,
    categories, paymentMethods, createCategory, deleteCategory, createPaymentMethod, deletePaymentMethod,
  } = useAppStore();

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [showApplePayGuide, setShowApplePayGuide] = useState(false);
  const [showGooglePayGuide, setShowGooglePayGuide] = useState(false);
  const [showWeeklyTimeModal, setShowWeeklyTimeModal] = useState(false);
  const [showWeeklyDayModal, setShowWeeklyDayModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(CATEGORY_COLORS[0]);
  const [newPaymentName, setNewPaymentName] = useState('');
  const [newPaymentType, setNewPaymentType] = useState('other');
  const [newPaymentLastFour, setNewPaymentLastFour] = useState('');

  // Notification settings
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifHour, setNotifHour] = useState(20);
  const [notifMinute, setNotifMinute] = useState(0);
  const [permissionStatus, setPermissionStatus] = useState<string>('undetermined');
  const [isSendingQuickAdd, setIsSendingQuickAdd] = useState(false);

  // Weekly summary settings
  const [weeklyEnabled, setWeeklyEnabled] = useState(false);
  const [weeklyDay, setWeeklyDay] = useState(0);    // 0=Sunday
  const [weeklyHour, setWeeklyHour] = useState(20);
  const [weeklyMinute, setWeeklyMinute] = useState(0);
  const [weeklyPreview, setWeeklyPreview] = useState<{ title: string; body: string } | null>(null);
  const [isLoadingWeekly, setIsLoadingWeekly] = useState(false);

  // Dark mode and export
  const [darkMode, setDarkMode] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const previousProfileIdRef = useRef<string | null>(activeProfile?.profile_id || null);
  const canStartExport = shouldStartExport({ isExporting, profileId: activeProfile?.profile_id });

  const SHORTCUT_URL = 'expensetracker://add?amount=AMOUNT&merchant=MERCHANT&category=CATEGORY&fromShortcut=true';
  const APPLE_PAY_URL = 'expensetracker://add?amount={{Shortcut Input}}&merchant={{Shortcut Input}}&fromShortcut=true';
  const GOOGLE_PAY_URL = 'expensetracker://add?amount=%ntitle&merchant=%ntext&fromGooglePay=true';

  useEffect(() => {
    loadNotificationSettings();
    loadWeeklySettings();
    loadDarkModeSettings();
  }, []);

  useEffect(() => {
    const previousProfileId = previousProfileIdRef.current;
    const nextProfileId = activeProfile?.profile_id || null;
    if (shouldCloseExportModalOnProfileSwitch({
      previousProfileId,
      nextProfileId,
      isExportModalOpen: showExportModal,
    })) {
      setShowExportModal(false);
      setIsExporting(false);
    }
    previousProfileIdRef.current = nextProfileId;
  }, [activeProfile?.profile_id, showExportModal]);

  const loadDarkModeSettings = async () => {
    try {
      const response = await settingsAPI.get();
      setDarkMode(response.data.dark_mode || false);
    } catch (error) {
      console.log('Failed to load dark mode settings');
    }
  };

  const handleToggleDarkMode = async (value: boolean) => {
    setDarkMode(value);
    try {
      await settingsAPI.update({ dark_mode: value });
    } catch (error) {
      console.log('Failed to save dark mode setting');
    }
  };

  const handleExportCSV = async () => {
    if (!shouldStartExport({ isExporting, profileId: activeProfile?.profile_id })) return;
    try {
      setIsExporting(true);
      const response = await exportAPI.getCSV(activeProfile.profile_id);
      const csvData = response.data;
      
      if (Platform.OS === 'web') {
        // For web, create a download link
        const blob = new Blob([csvData], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = buildExportFileName(activeProfile.name, 'csv');
        a.click();
      } else {
        // For mobile, save to file and share
        const fileUri = FileSystem.documentDirectory + buildExportFileName(activeProfile.name, 'csv');
        await FileSystem.writeAsStringAsync(fileUri, csvData);
        await Sharing.shareAsync(fileUri, { mimeType: 'text/csv' });
      }
      setShowExportModal(false);
    } catch (error) {
      Alert.alert('Error', getExportErrorMessage(error, 'csv'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportJSON = async () => {
    if (!shouldStartExport({ isExporting, profileId: activeProfile?.profile_id })) return;
    try {
      setIsExporting(true);
      const response = await exportAPI.getJSON(activeProfile.profile_id);
      const jsonData = JSON.stringify(response.data, null, 2);
      
      if (Platform.OS === 'web') {
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = buildExportFileName(activeProfile.name, 'json');
        a.click();
      } else {
        const fileUri = FileSystem.documentDirectory + buildExportFileName(activeProfile.name, 'json');
        await FileSystem.writeAsStringAsync(fileUri, jsonData);
        await Sharing.shareAsync(fileUri, { mimeType: 'application/json' });
      }
      setShowExportModal(false);
    } catch (error) {
      Alert.alert('Error', getExportErrorMessage(error, 'json'));
    } finally {
      setIsExporting(false);
    }
  };

  // Pre-fetch weekly summary for preview when enabled
  useEffect(() => {
    if (weeklyEnabled && activeProfile && !weeklyPreview) {
      fetchWeeklySummary();
    }
  }, [weeklyEnabled, activeProfile]);

  const loadNotificationSettings = async () => {
    const settings = await notificationService.getSettings();
    setNotifEnabled(settings.enabled);
    setNotifHour(settings.hour);
    setNotifMinute(settings.minute);
    const status = await notificationService.getPermissionStatus();
    setPermissionStatus(status);
  };

  const loadWeeklySettings = async () => {
    const settings = await notificationService.getWeeklySettings();
    setWeeklyEnabled(settings.enabled);
    setWeeklyDay(settings.day);
    setWeeklyHour(settings.hour);
    setWeeklyMinute(settings.minute);
  };

  const fetchWeeklySummary = async () => {
    if (!activeProfile) return;
    try {
      setIsLoadingWeekly(true);
      const resp = await api.get(`/stats/weekly-summary?profile_id=${activeProfile.profile_id}`);
      setWeeklyPreview({ title: resp.data.notification_title, body: resp.data.notification_body });
    } catch {
      setWeeklyPreview({
        title: '📊 Weekly Summary',
        body: "See how much you spent this week — tap to view stats",
      });
    } finally {
      setIsLoadingWeekly(false);
    }
  };

  const handleToggleReminder = async (value: boolean) => {
    if (value) {
      const granted = await notificationService.requestPermissions();
      if (!granted) {
        if (Platform.OS !== 'web') {
          Alert.alert(
            'Notifications Required',
            'Please enable notifications in your device Settings to use daily reminders.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]
          );
        }
        return;
      }
      setPermissionStatus('granted');
      await notificationService.scheduleReminder(notifHour, notifMinute);
      await notificationService.saveSettings({ enabled: true, hour: notifHour, minute: notifMinute });
      setNotifEnabled(true);
      // Send a test notification
      await notificationService.sendTestNotification();
      Alert.alert('✅ Reminders On', `You'll receive daily reminders at ${formatTime(notifHour, notifMinute)}`);
    } else {
      await notificationService.cancelDailyReminder();
      await notificationService.saveSettings({ enabled: false, hour: notifHour, minute: notifMinute });
      setNotifEnabled(false);
    }
  };

  const handleToggleWeeklySummary = async (value: boolean) => {
    if (value) {
      const granted = await notificationService.requestPermissions();
      if (!granted) {
        if (Platform.OS !== 'web') {
          Alert.alert(
            'Notifications Required',
            'Please enable notifications in Settings to use Weekly Summary.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]
          );
        }
        return;
      }
      // Fetch real data for the notification
      let title = '📊 Weekly Summary';
      let body = "Check your weekly spending recap — tap to view stats";
      try {
        if (activeProfile) {
          const resp = await api.get(`/stats/weekly-summary?profile_id=${activeProfile.profile_id}`);
          title = resp.data.notification_title;
          body = resp.data.notification_body;
          setWeeklyPreview({ title, body });
        }
      } catch {
        setWeeklyPreview({ title, body });
      }
      await notificationService.scheduleWeeklySummary(weeklyDay, weeklyHour, weeklyMinute, title, body);
      await notificationService.saveWeeklySettings({ enabled: true, day: weeklyDay, hour: weeklyHour, minute: weeklyMinute });
      setWeeklyEnabled(true);
      // Preview notification in 3s
      await notificationService.sendWeeklySummaryPreview(title, body);
      Alert.alert('✅ Weekly Summary On', `You'll receive a spending recap every ${WEEK_DAYS[weeklyDay]} at ${formatTime(weeklyHour, weeklyMinute)}`);
    } else {
      await notificationService.cancelWeeklySummary();
      await notificationService.saveWeeklySettings({ enabled: false, day: weeklyDay, hour: weeklyHour, minute: weeklyMinute });
      setWeeklyEnabled(false);
    }
  };

  const handleWeeklyTimeChange = async (hour: number, minute: number) => {
    setWeeklyHour(hour);
    setWeeklyMinute(minute);
    if (weeklyEnabled) {
      const title = weeklyPreview?.title || '📊 Weekly Summary';
      const body = weeklyPreview?.body || "Check your weekly spending recap";
      await notificationService.scheduleWeeklySummary(weeklyDay, hour, minute, title, body);
      await notificationService.saveWeeklySettings({ enabled: true, day: weeklyDay, hour, minute });
    } else {
      await notificationService.saveWeeklySettings({ enabled: false, day: weeklyDay, hour, minute });
    }
    setShowWeeklyTimeModal(false);
  };

  const handleWeeklyDayChange = async (day: number) => {
    setWeeklyDay(day);
    if (weeklyEnabled) {
      const title = weeklyPreview?.title || '📊 Weekly Summary';
      const body = weeklyPreview?.body || "Check your weekly spending recap";
      await notificationService.scheduleWeeklySummary(day, weeklyHour, weeklyMinute, title, body);
      await notificationService.saveWeeklySettings({ enabled: true, day, hour: weeklyHour, minute: weeklyMinute });
    } else {
      await notificationService.saveWeeklySettings({ enabled: false, day, hour: weeklyHour, minute: weeklyMinute });
    }
    setShowWeeklyDayModal(false);
  };

  const handleTimeChange = async (hour: number, minute: number) => {
    setNotifHour(hour);
    setNotifMinute(minute);
    if (notifEnabled) {
      await notificationService.scheduleReminder(hour, minute);
      await notificationService.saveSettings({ enabled: true, hour, minute });
    } else {
      await notificationService.saveSettings({ enabled: false, hour, minute });
    }
    setShowTimeModal(false);
  };

  const handleSendQuickNotification = async () => {
    setIsSendingQuickAdd(true);
    const success = await notificationService.sendQuickAddNotification();
    setIsSendingQuickAdd(false);
    if (!success) {
      Alert.alert('Notifications not available', 'Enable notifications in Settings first.');
    } else if (Platform.OS === 'web') {
      Alert.alert('📱 Mobile Only', 'Quick Add notifications work best on iOS/Android. On web, use the + button to add expenses.');
    }
  };

  const handleCopyDeepLink = async () => {
    try {
      await Clipboard.setStringAsync(SHORTCUT_URL);
      Alert.alert('Copied!', 'Shortcut URL copied to clipboard');
    } catch {
      Alert.alert('Error', 'Could not copy to clipboard');
    }
  };

  const handleOpenShortcuts = () => {
    if (Platform.OS === 'ios') {
      Linking.openURL('shortcuts://create-shortcut').catch(() => {
        Linking.openURL('https://support.apple.com/guide/shortcuts/intro-to-shortcuts-apdf22b0444c/ios');
      });
    } else {
      Alert.alert('iOS Only', 'Apple Shortcuts automation is only available on iOS devices.');
    }
  };

  const formatTime = (h: number, m: number) => {
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
  };

  const handleProfileSwitch = (profile: any) => {
    setActiveProfile(profile);
    fetchExpenses(profile.profile_id);
    fetchSummary(profile.profile_id, 'month');
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) { Alert.alert('Error', 'Enter a name'); return; }
    try {
      await createCategory({ name: newCategoryName.trim(), color: newCategoryColor, icon: 'pricetag' });
      setShowCategoryModal(false);
      setNewCategoryName('');
    } catch { Alert.alert('Error', 'Failed to create category'); }
  };

  const handleDeleteCategory = (id: string, isDefault: boolean) => {
    if (isDefault) { Alert.alert('Cannot Delete', 'Default categories are protected'); return; }
    Alert.alert('Delete Category', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteCategory(id) },
    ]);
  };

  const handleAddPaymentMethod = async () => {
    if (!newPaymentName.trim()) { Alert.alert('Error', 'Enter a name'); return; }
    try {
      await createPaymentMethod({ name: newPaymentName.trim(), type: newPaymentType, last_four: newPaymentLastFour.trim() || undefined });
      setShowPaymentModal(false);
      setNewPaymentName('');
      setNewPaymentLastFour('');
    } catch { Alert.alert('Error', 'Failed to create payment method'); }
  };

  const handleDeletePaymentMethod = (id: string) => {
    Alert.alert('Delete', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deletePaymentMethod(id) },
    ]);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>More</Text>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* User Info */}
          <View style={styles.userCard}>
            <View style={styles.avatar}>
              <Ionicons name={isGuestMode ? 'person-outline' : 'person'} size={28} color="#007AFF" />
            </View>
            <View style={styles.userInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.userName}>{user?.name || 'User'}</Text>
                {isGuestMode && <View style={styles.guestBadge}><Text style={styles.guestBadgeText}>GUEST</Text></View>}
              </View>
              <Text style={styles.userEmail}>{isGuestMode ? 'Data stored locally' : user?.email || ''}</Text>
            </View>
          </View>

          {/* ====== PROFILE SWITCHER ====== */}
          <Text style={styles.sectionTitle}>Profile</Text>
          <View style={styles.card}>
            {profiles.map(profile => (
              <TouchableOpacity
                key={profile.profile_id}
                style={[styles.profileRow, activeProfile?.profile_id === profile.profile_id && styles.profileRowActive]}
                onPress={() => handleProfileSwitch(profile)}
              >
                <View style={styles.profileLeft}>
                  <Ionicons
                    name={profile.name.toLowerCase().includes('business') ? 'briefcase' : 'person'}
                    size={20}
                    color={activeProfile?.profile_id === profile.profile_id ? '#007AFF' : '#8E8E93'}
                  />
                  <Text style={[styles.profileName, activeProfile?.profile_id === profile.profile_id && styles.profileNameActive]}>
                    {profile.name}
                  </Text>
                </View>
                {activeProfile?.profile_id === profile.profile_id && (
                  <Ionicons name="checkmark-circle" size={22} color="#007AFF" />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Categories */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Categories</Text>
            <TouchableOpacity onPress={() => setShowCategoryModal(true)} style={styles.addBtn}>
              <Ionicons name="add-circle-outline" size={20} color="#007AFF" />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            {categories.map((cat, i) => (
              <View key={cat.category_id}>
                <View style={styles.listRow}>
                  <View style={styles.listRowLeft}>
                    <View style={[styles.catDot, { backgroundColor: cat.color }]} />
                    <Text style={styles.listRowText}>{cat.name}</Text>
                    {cat.is_default && <View style={styles.defaultBadge}><Text style={styles.defaultBadgeText}>Default</Text></View>}
                  </View>
                  <TouchableOpacity onPress={() => handleDeleteCategory(cat.category_id, cat.is_default)}>
                    <Ionicons name="trash-outline" size={18} color={cat.is_default ? '#C7C7CC' : '#FF3B30'} />
                  </TouchableOpacity>
                </View>
                {i < categories.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>

          {/* ====== AUTOMATION & REMINDERS SECTION ====== */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Automation</Text>
            <TouchableOpacity onPress={() => setShowOnboardingModal(true)} style={styles.addBtn}>
              <Ionicons name="information-circle-outline" size={20} color="#007AFF" />
              <Text style={styles.addBtnText}>How it works</Text>
            </TouchableOpacity>
          </View>

          {/* Notification Promo Card */}
          <TouchableOpacity
            style={automationStyles.promoCard}
            onPress={() => setShowOnboardingModal(true)}
            activeOpacity={0.85}
          >
            <View style={automationStyles.promoLeft}>
              <View style={automationStyles.promoIconBg}>
                <Text style={{ fontSize: 22 }}>🔔</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={automationStyles.promoTitle}>Quick Add from Notifications</Text>
                <Text style={automationStyles.promoSubtitle}>Tap any reminder to instantly log an expense</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8E8E93" />
          </TouchableOpacity>

          {/* Apple Pay Auto-Detect Card */}
          <TouchableOpacity
            style={[automationStyles.promoCard, { borderLeftColor: '#000' }]}
            onPress={() => setShowApplePayGuide(true)}
            activeOpacity={0.85}
          >
            <View style={automationStyles.promoLeft}>
              <View style={[automationStyles.promoIconBg, { backgroundColor: '#F5F5F5' }]}>
                <Text style={{ fontSize: 22 }}>  Pay</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={automationStyles.promoTitle}>Apple Pay Auto-Detect</Text>
                <Text style={automationStyles.promoSubtitle}>Auto-fill expenses when you pay with Apple Pay</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={automationStyles.setupBadge}>
                <Text style={automationStyles.setupBadgeText}>Set Up</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#8E8E93" />
            </View>
          </TouchableOpacity>

          {/* Google Pay Auto-Detect Card */}
          <TouchableOpacity
            style={[automationStyles.promoCard, { borderLeftColor: '#34A853' }]}
            onPress={() => setShowGooglePayGuide(true)}
            activeOpacity={0.85}
          >
            <View style={automationStyles.promoLeft}>
              <View style={[automationStyles.promoIconBg, { backgroundColor: '#E8F5E9' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#4285F4', justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '900', color: '#FFF' }}>G</Text>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#5F6368' }}>Pay</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={automationStyles.promoTitle}>Google Pay Auto-Detect</Text>
                <Text style={automationStyles.promoSubtitle}>Auto-fill expenses when you pay with Google Pay</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[automationStyles.setupBadge, { backgroundColor: '#E8F5E9', borderColor: '#BBF7D0' }]}>
                <Text style={[automationStyles.setupBadgeText, { color: '#166534' }]}>Set Up</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#8E8E93" />
            </View>
          </TouchableOpacity>

          {/* Weekly Summary Card */}
          <TouchableOpacity
            style={[automationStyles.promoCard, { borderLeftColor: '#8B5CF6' }]}
            onPress={() => { fetchWeeklySummary(); }}
            activeOpacity={0.85}
          >
            <View style={automationStyles.promoLeft}>
              <View style={[automationStyles.promoIconBg, { backgroundColor: '#F3E8FF' }]}>
                <Text style={{ fontSize: 22 }}>📊</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={automationStyles.promoTitle}>Weekly Summary</Text>
                <Text style={automationStyles.promoSubtitle} numberOfLines={2}>
                  {weeklyPreview ? weeklyPreview.body : 'Get a weekly spending recap every Sunday'}
                </Text>
              </View>
            </View>
            <Switch
              value={weeklyEnabled}
              onValueChange={handleToggleWeeklySummary}
              trackColor={{ false: '#E5E5EA', true: '#8B5CF6' }}
              thumbColor="#FFF"
              style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
            />
          </TouchableOpacity>

          {/* Weekly Summary settings (when enabled) */}
          {weeklyEnabled && (
            <View style={[styles.card, { marginTop: -8 }]}>
              <TouchableOpacity style={styles.listRow} onPress={() => setShowWeeklyDayModal(true)}>
                <View style={styles.listRowLeft}>
                  <View style={[automationStyles.iconBg, { backgroundColor: '#F3E8FF' }]}>
                    <Ionicons name="calendar-outline" size={18} color="#8B5CF6" />
                  </View>
                  <Text style={styles.listRowText}>Send on</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[automationStyles.timeValue, { color: '#8B5CF6' }]}>{WEEK_DAYS[weeklyDay]}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                </View>
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.listRow} onPress={() => setShowWeeklyTimeModal(true)}>
                <View style={styles.listRowLeft}>
                  <View style={[automationStyles.iconBg, { backgroundColor: '#F3E8FF' }]}>
                    <Ionicons name="time-outline" size={18} color="#8B5CF6" />
                  </View>
                  <Text style={styles.listRowText}>Send at</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[automationStyles.timeValue, { color: '#8B5CF6' }]}>{formatTime(weeklyHour, weeklyMinute)}</Text>
                  <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                </View>
              </TouchableOpacity>
              {weeklyPreview && (
                <>
                  <View style={styles.divider} />
                  <View style={automationStyles.previewBox}>
                    <Text style={automationStyles.previewLabel}>Preview notification</Text>
                    <Text style={automationStyles.previewTitle}>{weeklyPreview.title}</Text>
                    <Text style={automationStyles.previewBody}>{weeklyPreview.body}</Text>
                  </View>
                </>
              )}
            </View>
          )}

          {/* Daily Reminder Toggle */}
          <View style={styles.card}>
            <View style={styles.listRow}>
              <View style={styles.listRowLeft}>
                <View style={automationStyles.iconBg}>
                  <Ionicons name="alarm-outline" size={18} color="#FF9500" />
                </View>
                <View>
                  <Text style={styles.listRowText}>Daily Reminder</Text>
                  <Text style={automationStyles.subLabel}>Remind me to log expenses</Text>
                </View>
              </View>
              <Switch
                value={notifEnabled}
                onValueChange={handleToggleReminder}
                trackColor={{ false: '#E5E5EA', true: '#34C759' }}
                thumbColor="#FFF"
              />
            </View>

            {notifEnabled && (
              <>
                <View style={styles.divider} />
                <TouchableOpacity style={styles.listRow} onPress={() => setShowTimeModal(true)}>
                  <View style={styles.listRowLeft}>
                    <View style={[automationStyles.iconBg, { backgroundColor: '#E3F2FD' }]}>
                      <Ionicons name="time-outline" size={18} color="#007AFF" />
                    </View>
                    <Text style={styles.listRowText}>Reminder Time</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={automationStyles.timeValue}>{formatTime(notifHour, notifMinute)}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                  </View>
                </TouchableOpacity>
              </>
            )}

            <View style={styles.divider} />

            {/* Quick Add Now */}
            <TouchableOpacity style={styles.listRow} onPress={handleSendQuickNotification} disabled={isSendingQuickAdd}>
              <View style={styles.listRowLeft}>
                <View style={[automationStyles.iconBg, { backgroundColor: '#E8F5E9' }]}>
                  <Ionicons name="flash-outline" size={18} color="#34C759" />
                </View>
                <View>
                  <Text style={styles.listRowText}>Send Quick Add Now</Text>
                  <Text style={automationStyles.subLabel}>Test notification → tap → add expense</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
            </TouchableOpacity>
          </View>

          {/* Apple Shortcuts */}
          {Platform.OS === 'ios' && (
            <View style={styles.card}>
              <TouchableOpacity style={styles.listRow} onPress={handleOpenShortcuts}>
                <View style={styles.listRowLeft}>
                  <View style={[automationStyles.iconBg, { backgroundColor: '#F3E8FF' }]}>
                    <Ionicons name="git-branch-outline" size={18} color="#8B5CF6" />
                  </View>
                  <View>
                    <Text style={styles.listRowText}>Apple Shortcuts</Text>
                    <Text style={automationStyles.subLabel}>Open Shortcuts app to create automation</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.listRow} onPress={handleCopyDeepLink}>
                <View style={styles.listRowLeft}>
                  <View style={[automationStyles.iconBg, { backgroundColor: '#FFF3CD' }]}>
                    <Ionicons name="copy-outline" size={18} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listRowText}>Copy Shortcut URL</Text>
                    <Text style={[automationStyles.subLabel, { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 10 }]} numberOfLines={1}>
                      expensetracker://add?amount=...
                    </Text>
                  </View>
                </View>
                <Ionicons name="copy-outline" size={16} color="#C7C7CC" />
              </TouchableOpacity>
            </View>
          )}

          {/* Payment Methods */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Payment Methods</Text>
            <TouchableOpacity onPress={() => setShowPaymentModal(true)} style={styles.addBtn}>
              <Ionicons name="add-circle-outline" size={20} color="#007AFF" />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            {paymentMethods.map((pm, i) => (
              <View key={pm.payment_id}>
                <View style={styles.listRow}>
                  <View style={styles.listRowLeft}>
                    <Ionicons name={pm.type === 'cash' ? 'cash' : pm.type.includes('card') ? 'card' : 'wallet'} size={18} color="#007AFF" />
                    <Text style={styles.listRowText}>{pm.name}</Text>
                    {pm.last_four && <Text style={styles.lastFour}>•••• {pm.last_four}</Text>}
                  </View>
                  <TouchableOpacity onPress={() => handleDeletePaymentMethod(pm.payment_id)}>
                    <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                  </TouchableOpacity>
                </View>
                {i < paymentMethods.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>

          {/* Settings Section */}
          <Text style={styles.sectionTitle}>Settings</Text>
          <View style={styles.card}>
            {/* Dark Mode Toggle */}
            <View style={styles.listRow}>
              <View style={styles.listRowLeft}>
                <View style={[automationStyles.iconBg, { backgroundColor: darkMode ? '#2C2C2E' : '#F5F5F7' }]}>
                  <Ionicons name={darkMode ? 'moon' : 'sunny'} size={18} color={darkMode ? '#FFD60A' : '#FF9500'} />
                </View>
                <View>
                  <Text style={styles.listRowText}>Dark Mode</Text>
                  <Text style={automationStyles.subLabel}>Switch between light and dark theme</Text>
                </View>
              </View>
              <Switch
                value={darkMode}
                onValueChange={handleToggleDarkMode}
                trackColor={{ false: '#E5E5EA', true: '#34C759' }}
                thumbColor="#FFF"
              />
            </View>
            <View style={styles.divider} />
            {/* Export Data */}
            <TouchableOpacity style={styles.listRow} onPress={() => setShowExportModal(true)}>
              <View style={styles.listRowLeft}>
                <View style={[automationStyles.iconBg, { backgroundColor: '#E8F5E9' }]}>
                  <Ionicons name="download-outline" size={18} color="#34C759" />
                </View>
                <View>
                  <Text style={styles.listRowText}>Export Data</Text>
                  <Text style={automationStyles.subLabel}>Download your expense data</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
            </TouchableOpacity>
          </View>

          {/* Sign Out */}
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color="#FF3B30" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>

          <Text style={styles.version}>Version 1.0.0</Text>
          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>

      {/* Add Category Modal */}
      <Modal visible={showCategoryModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.content}>
            <View style={modalStyles.header}>
              <Text style={modalStyles.title}>New Category</Text>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>
            <View style={modalStyles.body}>
              <Text style={modalStyles.label}>Name</Text>
              <TextInput style={modalStyles.input} value={newCategoryName} onChangeText={setNewCategoryName}
                placeholder="e.g., Subscriptions" placeholderTextColor="#C7C7CC" />
              <Text style={[modalStyles.label, { marginTop: 16 }]}>Color</Text>
              <View style={modalStyles.colorGrid}>
                {CATEGORY_COLORS.map(color => (
                  <TouchableOpacity key={color} style={[modalStyles.colorDot, { backgroundColor: color },
                    newCategoryColor === color && modalStyles.colorDotSelected]} onPress={() => setNewCategoryColor(color)}>
                    {newCategoryColor === color && <Ionicons name="checkmark" size={14} color="#FFF" />}
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={modalStyles.saveBtn} onPress={handleAddCategory}>
                <Text style={modalStyles.saveBtnText}>Add Category</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Payment Modal */}
      <Modal visible={showPaymentModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.content}>
            <View style={modalStyles.header}>
              <Text style={modalStyles.title}>New Payment Method</Text>
              <TouchableOpacity onPress={() => setShowPaymentModal(false)}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>
            <ScrollView style={modalStyles.body}>
              <Text style={modalStyles.label}>Name</Text>
              <TextInput style={modalStyles.input} value={newPaymentName} onChangeText={setNewPaymentName}
                placeholder="e.g., Chase Visa" placeholderTextColor="#C7C7CC" />
              <Text style={[modalStyles.label, { marginTop: 16 }]}>Type</Text>
              <View style={modalStyles.typeGrid}>
                {PAYMENT_TYPES.map(pt => (
                  <TouchableOpacity key={pt.type}
                    style={[modalStyles.typeOption, newPaymentType === pt.type && modalStyles.typeOptionActive]}
                    onPress={() => setNewPaymentType(pt.type)}>
                    <Ionicons name={pt.icon as any} size={18} color={newPaymentType === pt.type ? '#FFF' : '#007AFF'} />
                    <Text style={[modalStyles.typeText, newPaymentType === pt.type && { color: '#FFF' }]}>{pt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[modalStyles.label, { marginTop: 16 }]}>Last 4 Digits (optional)</Text>
              <TextInput style={modalStyles.input} value={newPaymentLastFour}
                onChangeText={t => setNewPaymentLastFour(t.slice(0, 4))} placeholder="1234"
                placeholderTextColor="#C7C7CC" keyboardType="number-pad" maxLength={4} />
              <TouchableOpacity style={modalStyles.saveBtn} onPress={handleAddPaymentMethod}>
                <Text style={modalStyles.saveBtnText}>Add Payment Method</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Time Picker Modal */}
      <Modal visible={showTimeModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.content, { padding: 0 }]}>
            <View style={modalStyles.header}>
              <TouchableOpacity onPress={() => setShowTimeModal(false)}>
                <Text style={{ color: '#8E8E93', fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={modalStyles.title}>Reminder Time</Text>
              <TouchableOpacity onPress={() => handleTimeChange(notifHour, notifMinute)}>
                <Text style={{ color: '#007AFF', fontSize: 16, fontWeight: '600' }}>Done</Text>
              </TouchableOpacity>
            </View>
            <View style={timePickerStyles.container}>
              {/* Hour picker */}
              <ScrollView style={timePickerStyles.column} showsVerticalScrollIndicator={false}>
                <View style={{ height: 20 }} />
                {Array.from({ length: 24 }, (_, i) => i).map(h => (
                  <TouchableOpacity
                    key={h}
                    style={[timePickerStyles.item, notifHour === h && timePickerStyles.itemSelected]}
                    onPress={() => setNotifHour(h)}
                  >
                    <Text style={[timePickerStyles.itemText, notifHour === h && timePickerStyles.itemTextSelected]}>
                      {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                    </Text>
                  </TouchableOpacity>
                ))}
                <View style={{ height: 20 }} />
              </ScrollView>
              {/* Minute picker */}
              <ScrollView style={timePickerStyles.column} showsVerticalScrollIndicator={false}>
                <View style={{ height: 20 }} />
                {[0, 15, 30, 45].map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[timePickerStyles.item, notifMinute === m && timePickerStyles.itemSelected]}
                    onPress={() => setNotifMinute(m)}
                  >
                    <Text style={[timePickerStyles.itemText, notifMinute === m && timePickerStyles.itemTextSelected]}>
                      :{m.toString().padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      {/* Automation Onboarding Modal */}
      <AutomationOnboardingModal
        visible={showOnboardingModal}
        onClose={() => setShowOnboardingModal(false)}
      />

      {/* Apple Pay Setup Guide */}
      <ApplePaySetupGuide
        visible={showApplePayGuide}
        onClose={() => setShowApplePayGuide(false)}
        deepLinkURL={APPLE_PAY_URL}
      />

      {/* Google Pay Setup Guide */}
      <GooglePaySetupGuide
        visible={showGooglePayGuide}
        onClose={() => setShowGooglePayGuide(false)}
        deepLinkURL={GOOGLE_PAY_URL}
      />

      {/* Weekly Summary Day Picker */}
      <Modal visible={showWeeklyDayModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.content, { padding: 0 }]}>
            <View style={modalStyles.header}>
              <TouchableOpacity onPress={() => setShowWeeklyDayModal(false)}>
                <Text style={{ color: '#8E8E93', fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={modalStyles.title}>Send On Day</Text>
              <View style={{ width: 60 }} />
            </View>
            <View style={{ paddingVertical: 8 }}>
              {WEEK_DAYS.map((day, idx) => (
                <TouchableOpacity
                  key={day}
                  style={[timePickerStyles.item, weeklyDay === idx && timePickerStyles.itemSelected, { marginHorizontal: 12 }]}
                  onPress={() => handleWeeklyDayChange(idx)}
                >
                  <Text style={[timePickerStyles.itemText, weeklyDay === idx && { ...timePickerStyles.itemTextSelected, color: '#8B5CF6', fontWeight: '700' }]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Weekly Summary Time Picker */}
      <Modal visible={showWeeklyTimeModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={[modalStyles.content, { padding: 0 }]}>
            <View style={modalStyles.header}>
              <TouchableOpacity onPress={() => setShowWeeklyTimeModal(false)}>
                <Text style={{ color: '#8E8E93', fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={modalStyles.title}>Send At Time</Text>
              <TouchableOpacity onPress={() => handleWeeklyTimeChange(weeklyHour, weeklyMinute)}>
                <Text style={{ color: '#8B5CF6', fontSize: 16, fontWeight: '600' }}>Done</Text>
              </TouchableOpacity>
            </View>
            <View style={timePickerStyles.container}>
              <ScrollView style={timePickerStyles.column} showsVerticalScrollIndicator={false}>
                <View style={{ height: 20 }} />
                {Array.from({ length: 24 }, (_, i) => i).map(h => (
                  <TouchableOpacity
                    key={h}
                    style={[timePickerStyles.item, weeklyHour === h && timePickerStyles.itemSelected]}
                    onPress={() => setWeeklyHour(h)}
                  >
                    <Text style={[timePickerStyles.itemText, weeklyHour === h && timePickerStyles.itemTextSelected]}>
                      {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                    </Text>
                  </TouchableOpacity>
                ))}
                <View style={{ height: 20 }} />
              </ScrollView>
              <ScrollView style={timePickerStyles.column} showsVerticalScrollIndicator={false}>
                <View style={{ height: 20 }} />
                {[0, 15, 30, 45].map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[timePickerStyles.item, weeklyMinute === m && timePickerStyles.itemSelected]}
                    onPress={() => setWeeklyMinute(m)}
                  >
                    <Text style={[timePickerStyles.itemText, weeklyMinute === m && timePickerStyles.itemTextSelected]}>
                      :{m.toString().padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
                <View style={{ height: 20 }} />
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      {/* Export Data Modal */}
      <Modal visible={showExportModal} animationType="slide" transparent>
        <View style={modalStyles.overlay}>
          <View style={modalStyles.content}>
            <View style={modalStyles.header}>
              <Text style={modalStyles.title}>Export Data</Text>
              <TouchableOpacity onPress={() => setShowExportModal(false)}>
                <Ionicons name="close" size={24} color="#8E8E93" />
              </TouchableOpacity>
            </View>
            <Text style={{ color: '#8E8E93', fontSize: 14, marginBottom: 20 }}>
              Export your expense data for {activeProfile?.name || 'all profiles'}
            </Text>
            {!activeProfile ? (
              <Text style={{ color: '#8E8E93', fontSize: 13, marginBottom: 20 }}>
                Select a profile to enable export.
              </Text>
            ) : null}
            
            <TouchableOpacity 
              style={[exportStyles.optionCard, !canStartExport && { opacity: 0.5 }]} 
              onPress={handleExportCSV}
              disabled={!canStartExport}
            >
              <View style={[exportStyles.iconBg, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="document-text-outline" size={24} color="#34C759" />
              </View>
              <View style={exportStyles.optionInfo}>
                <Text style={exportStyles.optionTitle}>Export as CSV</Text>
                <Text style={exportStyles.optionDesc}>Spreadsheet format for Excel, Google Sheets</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={[exportStyles.optionCard, !canStartExport && { opacity: 0.5 }]} 
              onPress={handleExportJSON}
              disabled={!canStartExport}
            >
              <View style={[exportStyles.iconBg, { backgroundColor: '#FFF3E0' }]}>
                <Ionicons name="code-slash-outline" size={24} color="#FF9500" />
              </View>
              <View style={exportStyles.optionInfo}>
                <Text style={exportStyles.optionTitle}>Export as JSON</Text>
                <Text style={exportStyles.optionDesc}>Raw data format with full details</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
            </TouchableOpacity>

            {isExporting && (
              <Text style={{ textAlign: 'center', color: '#007AFF', marginTop: 16 }}>
                Preparing export...
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const timePickerStyles = StyleSheet.create({
  container: { flexDirection: 'row', height: 220 },
  column: { flex: 1 },
  item: { paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  itemSelected: { backgroundColor: '#E3F2FD', marginHorizontal: 8, borderRadius: 10 },
  itemText: { fontSize: 17, color: '#555' },
  itemTextSelected: { color: '#007AFF', fontWeight: '700' },
});

const automationStyles = StyleSheet.create({
  promoCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 0.5,
    borderColor: '#E5E5EA',
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  promoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  promoIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  promoTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
    marginBottom: 2,
  },
  promoSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
  },
  iconBg: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFF3CD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  subLabel: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 1,
  },
  timeValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#007AFF',
  },
  setupBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  setupBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  previewBox: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8F8FF',
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  previewBody: {
    fontSize: 13,
    color: '#555',
    lineHeight: 18,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F8FA' },
  safeArea: { flex: 1 },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#000' },
  content: { flex: 1, paddingHorizontal: 16 },
  // User card
  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 0.5, borderColor: '#E5E5EA' },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  userInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userName: { fontSize: 17, fontWeight: '700', color: '#000' },
  userEmail: { fontSize: 13, color: '#8E8E93', marginTop: 2 },
  guestBadge: { backgroundColor: '#FFF3CD', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  guestBadgeText: { fontSize: 10, color: '#856404', fontWeight: '600' },
  // Profile
  profileRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  profileRowActive: { backgroundColor: '#E3F2FD' },
  profileLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  profileName: { fontSize: 16, color: '#000' },
  profileNameActive: { fontWeight: '600', color: '#007AFF' },
  // Section
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#000', marginBottom: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { fontSize: 14, color: '#007AFF', fontWeight: '500' },
  // Card
  card: { backgroundColor: '#FFF', borderRadius: 12, marginBottom: 16, borderWidth: 0.5, borderColor: '#E5E5EA', overflow: 'hidden' },
  // List row
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16 },
  listRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  catDot: { width: 12, height: 12, borderRadius: 6 },
  listRowText: { fontSize: 15, color: '#000' },
  defaultBadge: { backgroundColor: '#E3F2FD', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  defaultBadgeText: { fontSize: 10, color: '#007AFF', fontWeight: '600' },
  lastFour: { fontSize: 12, color: '#8E8E93' },
  divider: { height: 0.5, backgroundColor: '#E5E5EA', marginLeft: 44 },
  // Sign out
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF', borderRadius: 12, padding: 16, gap: 10, marginTop: 10, borderWidth: 0.5, borderColor: '#E5E5EA' },
  signOutText: { color: '#FF3B30', fontSize: 16, fontWeight: '600' },
  version: { textAlign: 'center', color: '#C7C7CC', fontSize: 13, marginTop: 16 },
});

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  content: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 0.5, borderBottomColor: '#E5E5EA' },
  title: { fontSize: 18, fontWeight: '700', color: '#000' },
  body: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#8E8E93', marginBottom: 8 },
  input: { backgroundColor: '#F8F8FA', borderRadius: 10, padding: 14, fontSize: 16, color: '#000' },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorDot: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  colorDotSelected: { borderWidth: 3, borderColor: '#FFF' },
  typeGrid: { gap: 8 },
  typeOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8FA', borderRadius: 10, padding: 12, gap: 10 },
  typeOptionActive: { backgroundColor: '#007AFF' },
  typeText: { fontSize: 15, color: '#000' },
  saveBtn: { backgroundColor: '#007AFF', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});


const exportStyles = StyleSheet.create({
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F8FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 14,
  },
  iconBg: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionInfo: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  optionDesc: {
    fontSize: 13,
    color: '#8E8E93',
  },
});
