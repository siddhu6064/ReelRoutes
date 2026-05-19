import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAppStore } from '../store/appStore';
import { Ionicons } from '@expo/vector-icons';

export function ProfileToggle() {
  const { profiles, activeProfile, setActiveProfile, fetchExpenses, fetchSummary } = useAppStore();
  const iconForProfileType = (profileType?: string) => {
    if (profileType === 'business') return 'briefcase';
    if (profileType === 'shared') return 'people';
    return 'person';
  };

  const handleToggle = async (profile: typeof activeProfile) => {
    if (profile && profile.profile_id !== activeProfile?.profile_id) {
      setActiveProfile(profile);
      await fetchExpenses(profile.profile_id);
      await fetchSummary(profile.profile_id);
    }
  };

  return (
    <View style={styles.container}>
      {profiles.map((profile) => (
        <TouchableOpacity
          key={profile.profile_id}
          style={[
            styles.toggleButton,
            activeProfile?.profile_id === profile.profile_id && styles.activeButton,
          ]}
          onPress={() => handleToggle(profile)}
        >
          <Ionicons
            name={iconForProfileType(profile.profile_type)}
            size={16}
            color={activeProfile?.profile_id === profile.profile_id ? '#fff' : '#6b7280'}
          />
          <Text
            style={[
              styles.toggleText,
              activeProfile?.profile_id === profile.profile_id && styles.activeText,
            ]}
          >
            {profile.name}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#1f2937',
    borderRadius: 12,
    padding: 4,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  activeButton: {
    backgroundColor: '#6366f1',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  activeText: {
    color: '#fff',
  },
});
