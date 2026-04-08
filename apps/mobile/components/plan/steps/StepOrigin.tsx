import React, { useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete'
import { useScratchPlanStore } from '@/stores/scratchPlanStore'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/components/plan/tokens'

const GOOGLE_API_KEY = (process.env['EXPO_PUBLIC_GOOGLE_MAPS_API_KEY']) ?? ''

interface Props {
  onNext: () => void
}

export default function StepOrigin({ onNext }: Props) {
  const startingPoint = useScratchPlanStore((s) => s.startingPoint)
  const destination   = useScratchPlanStore((s) => s.destination)
  const setStartingPoint = useScratchPlanStore((s) => s.setStartingPoint)
  const setDestination   = useScratchPlanStore((s) => s.setDestination)

  const canContinue = startingPoint.trim().length >= 2 && destination.trim().length >= 2

  const originRef = useRef<any>(null)
  const destRef   = useRef<any>(null)

  // Pre-populate refs if values already set (navigating back)
  React.useEffect(() => {
    if (startingPoint && originRef.current) {
      originRef.current.setAddressText(startingPoint)
    }
    if (destination && destRef.current) {
      destRef.current.setAddressText(destination)
    }
  }, [])

  const sharedACProps = {
    fetchDetails: false,
    query: { key: GOOGLE_API_KEY, language: 'en', types: '(cities)' },
    styles: {
      textInput: styles.acInput,
      listView: styles.acDropdown,
      row: styles.acRow,
      description: styles.acDescription,
      separator: styles.acSeparator,
    },
    enablePoweredByContainer: false,
    minLength: 2,
    debounce: 300,
    keepResultsAfterBlur: false,
    keyboardShouldPersistTaps: 'handled' as const,
  }

  return (
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Where are you going?</Text>
        <Text style={styles.subtitle}>
          Tell us your starting point and destination.
        </Text>

        {/* Starting from */}
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>STARTING FROM</Text>
          <View style={styles.acWrap}>
            <Text style={styles.fieldIcon}>📍</Text>
            <GooglePlacesAutocomplete
              ref={originRef}
              placeholder="e.g. Austin, TX"
              onPress={(data: { description: string }) => setStartingPoint(data.description)}
              onFail={(_err: unknown) => console.warn('Origin AC error')}
              textInputProps={{
                onChangeText: setStartingPoint,
                clearButtonMode: 'while-editing',
              }}
              {...sharedACProps}
            />
          </View>
        </View>

        {/* Arrow */}
        <Text style={styles.arrow}>↓</Text>

        {/* Destination */}
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>DESTINATION</Text>
          <View style={styles.acWrap}>
            <Text style={styles.fieldIcon}>🗺</Text>
            <GooglePlacesAutocomplete
              ref={destRef}
              placeholder="e.g. New Orleans, LA"
              onPress={(data: { description: string }) => setDestination(data.description)}
              onFail={(_err: unknown) => console.warn('Destination AC error')}
              textInputProps={{
                onChangeText: setDestination,
                clearButtonMode: 'while-editing',
              }}
              {...sharedACProps}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.btn, !canContinue && styles.btnDisabled]}
          onPress={onNext}
          disabled={!canContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.btnText}>Continue →</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  kav: { flex: 1 },
  scroll: { flex: 1 },
  container: {
    padding: Spacing.xl,
    paddingTop: Spacing.xxl,
    gap: Spacing.lg,
  },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: FontWeight.black,
    color: Colors.black,
    letterSpacing: -0.5,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.md,
    color: Colors.gray500,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  fieldWrap: { gap: Spacing.xs },
  fieldLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.gray700,
    letterSpacing: 0.8,
  },
  acWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1.5,
    borderColor: Colors.gray200,
    borderRadius: Radius.lg,
    backgroundColor: Colors.white,
    paddingLeft: Spacing.md,
    paddingTop: 2,
    overflow: 'hidden',
  },
  fieldIcon: { fontSize: 18, marginTop: 11 },
  acInput: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.black,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    backgroundColor: 'transparent',
  },
  acDropdown: {
    position: 'absolute',
    top: 52,
    left: -Spacing.md,
    right: 0,
    zIndex: 10,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: Radius.lg,
    backgroundColor: Colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  acRow: { padding: Spacing.md },
  acDescription: { fontSize: FontSize.md, color: Colors.black },
  acSeparator: { height: 0.5, backgroundColor: Colors.gray100 },
  arrow: {
    fontSize: 22,
    color: Colors.gray200,
    textAlign: 'center',
    marginVertical: -Spacing.xs,
  },
  btn: {
    backgroundColor: Colors.blue,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  btnDisabled: { opacity: 0.45 },
  btnText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
})
