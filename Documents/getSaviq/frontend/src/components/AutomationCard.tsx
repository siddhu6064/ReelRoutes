import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface AutomationOnboardingModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AutomationOnboardingModal({ visible, onClose }: AutomationOnboardingModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.container}>
          {/* Dark section */}
          <LinearGradient colors={['#1C1C1E', '#2C2C2E']} style={modalStyles.darkSection}>
            {/* Phone mockup */}
            <View style={modalStyles.phoneMockup}>
              <View style={modalStyles.phoneScreen}>
                <View style={modalStyles.mockHeader}>
                  <View style={[modalStyles.mockBtn, { backgroundColor: '#3A3A3C' }]}>
                    <Text style={modalStyles.mockBtnText}>Cancel</Text>
                  </View>
                  <View style={[modalStyles.mockBtn, { backgroundColor: '#007AFF' }]}>
                    <Text style={[modalStyles.mockBtnText, { color: '#FFF' }]}>Done</Text>
                  </View>
                </View>
                {/* Amount display */}
                <View style={modalStyles.mockAmountRow}>
                  <Text style={modalStyles.mockAmount}>$ 0.00</Text>
                </View>
                {/* Category chips */}
                <View style={modalStyles.mockChipsRow}>
                  {['🍔', '🚕', '🛒', '⚡'].map(emoji => (
                    <View key={emoji} style={modalStyles.mockChip}>
                      <Text style={modalStyles.mockChipText}>{emoji}</Text>
                    </View>
                  ))}
                </View>
                {/* Keyboard mockup */}
                {[['1','2','3'],['4','5','6'],['7','8','9'],['.',  '0','✓']].map((row, ri) => (
                  <View key={ri} style={modalStyles.mockKeyRow}>
                    {row.map(key => (
                      <View key={key} style={[modalStyles.mockKey, key === '✓' && { backgroundColor: '#007AFF' }]}>
                        <Text style={modalStyles.mockKeyText}>{key}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </View>

            {/* Title */}
            <Text style={modalStyles.darkTitle}>Notifications & Shortcuts</Text>
            <Text style={modalStyles.darkSubtitle}>Add expenses faster with daily reminders.</Text>
            <Text style={modalStyles.darkSubtitle}>Trigger Add Expense via notifications,</Text>
            <Text style={modalStyles.darkSubtitle}>Apple Shortcuts or Back Tap (double tap).</Text>

            <View style={modalStyles.darkDivider} />

            <Text style={modalStyles.whereTitle}>Where to find:</Text>
            <View style={modalStyles.breadcrumb}>
              <Text style={modalStyles.breadcrumbText}>More</Text>
              <Ionicons name="chevron-forward" size={14} color="#8E8E93" />
              <Text style={[modalStyles.breadcrumbText, { color: '#007AFF' }]}>Automation</Text>
            </View>
          </LinearGradient>

          {/* Got it button */}
          <TouchableOpacity style={modalStyles.gotItBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={modalStyles.gotItText}>Got it!</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
  },
  darkSection: {
    padding: 28,
    alignItems: 'center',
  },
  phoneMockup: {
    width: 160,
    height: 260,
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 28,
    borderWidth: 1,
    borderColor: '#3A3A3C',
  },
  phoneScreen: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    padding: 8,
  },
  mockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  mockBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  mockBtnText: {
    fontSize: 9,
    color: '#FFF',
    fontWeight: '600',
  },
  mockAmountRow: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  mockAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFF',
  },
  mockChipsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 8,
  },
  mockChip: {
    backgroundColor: '#3A3A3C',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  mockChipText: {
    fontSize: 12,
  },
  mockKeyRow: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 3,
  },
  mockKey: {
    flex: 1,
    backgroundColor: '#3A3A3C',
    borderRadius: 6,
    paddingVertical: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mockKeyText: {
    fontSize: 11,
    color: '#FFF',
    fontWeight: '600',
  },
  darkTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  darkSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
  },
  darkDivider: {
    height: 1,
    backgroundColor: '#3A3A3C',
    width: '100%',
    marginVertical: 20,
  },
  whereTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 12,
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breadcrumbText: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '500',
  },
  gotItBtn: {
    backgroundColor: '#007AFF',
    paddingVertical: 20,
    alignItems: 'center',
  },
  gotItText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
});
