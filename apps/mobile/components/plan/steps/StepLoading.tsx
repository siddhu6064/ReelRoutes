import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native'
import { useScratchPlanStore } from '@/stores/scratchPlanStore'
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/components/plan/tokens'

const STAGES = [
  'Asking AI for the best spots…',
  'Geocoding locations…',
  'Sorting stops by proximity…',
  'Enriching with local tips…',
  'Finding great restaurants…',
  'Finishing your itinerary…',
]

const STAGE_PCT  = [12, 30, 50, 68, 84, 97]
const STAGE_MS   = 3200

export default function StepLoading() {
  const destination = useScratchPlanStore((s) => s.destination)
  const days        = useScratchPlanStore((s) => s.days)

  const [stageIdx, setStageIdx] = useState(0)
  const progressAnim = useRef(new Animated.Value(0)).current
  const rotateAnim   = useRef(new Animated.Value(0)).current

  // Advance stage text
  useEffect(() => {
    const id = setInterval(() => {
      setStageIdx((i) => Math.min(i + 1, STAGES.length - 1))
    }, STAGE_MS)
    return () => clearInterval(id)
  }, [])

  // Animate progress bar
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: STAGE_PCT[stageIdx] / 100,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start()
  }, [stageIdx])

  // Spin the globe
  useEffect(() => {
    Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start()
  }, [])

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  const barWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  })

  return (
    <View style={styles.container}>
      {/* Animated globe */}
      <Animated.View style={[styles.orbitWrap, { transform: [{ rotate: spin }] }]}>
        <Text style={styles.globe}>🌍</Text>
        <Text style={styles.plane}>✈️</Text>
      </Animated.View>

      <Text style={styles.title}>
        Planning{' '}
        <Text style={styles.dayLabel}>
          {days} day{days !== 1 ? 's' : ''}
        </Text>
        {'\n'}in{' '}
        <Text style={styles.destLabel}>{destination}</Text>
      </Text>

      <Text style={styles.stage}>{STAGES[stageIdx]}</Text>

      {/* Progress bar */}
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, { width: barWidth }]} />
      </View>
      <Text style={styles.pct}>{STAGE_PCT[stageIdx]}%</Text>

      <Text style={styles.note}>Usually takes 15–25 seconds. Hang tight!</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
    gap: Spacing.xl,
  },
  orbitWrap: {
    width: 90,
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  globe: { fontSize: 44, position: 'absolute' },
  plane: { fontSize: 22, position: 'absolute', top: 0 },
  title: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.black,
    textAlign: 'center',
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  dayLabel: { color: Colors.gray700 },
  destLabel: { color: Colors.blue },
  stage: {
    fontSize: FontSize.md,
    color: Colors.gray500,
    textAlign: 'center',
    minHeight: 22,
  },
  barTrack: {
    width: '100%',
    height: 6,
    backgroundColor: Colors.gray100,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: Colors.blue,
    borderRadius: Radius.full,
  },
  pct: {
    fontSize: FontSize.xs,
    color: Colors.gray400,
    fontVariant: ['tabular-nums'],
    marginTop: -Spacing.md,
  },
  note: {
    fontSize: FontSize.xs,
    color: Colors.gray400,
    textAlign: 'center',
  },
})
