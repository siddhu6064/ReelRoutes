import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { ResponseType } from 'expo-auth-session';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../src/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { lightTheme, NeumorphicCard } from '../src/components/NeumorphicUI';

// Required to properly close the browser session after OAuth redirect
WebBrowser.maybeCompleteAuthSession();

type AuthMode = 'main' | 'login' | 'register';

export default function LoginScreen() {
  const {
    signInWithGoogle,
    signInWithApple,
    signInWithEmail,
    registerWithEmail,
    continueAsGuest,
    isLoading,
  } = useAuth();
  const router = useRouter();

  const [authMode, setAuthMode] = useState<AuthMode>('main');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  // ── Google OAuth hook (must be at top level) ──────────────────────────────
  const [, googleResponse, promptGoogleAsync] = Google.useAuthRequest({
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    iosClientId:     process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    webClientId:     process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    responseType:    ResponseType.IdToken,          // returns id_token directly
    scopes:          ['openid', 'profile', 'email'],
  });

  // Handle Google response when it arrives
  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const idToken = (googleResponse.params as any).id_token;
      if (idToken) {
        _handleGoogleToken(idToken);
      } else {
        Alert.alert('Google Sign-In', 'No ID token received. Please try again.');
      }
    } else if (googleResponse?.type === 'error') {
      const msg = (googleResponse.error as any)?.message || 'Authentication failed';
      Alert.alert('Google Sign-In Failed', msg);
    }
  }, [googleResponse]);

  // Check Apple availability on mount (iOS only, native build required)
  useEffect(() => {
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  // ── Google helpers ────────────────────────────────────────────────────────

  const _handleGoogleToken = async (idToken: string) => {
    try {
      setIsSigningIn(true);
      await signInWithGoogle(idToken);
    } catch (error: any) {
      Alert.alert('Sign-In Failed', error.message || 'Google authentication failed');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGoogleSignIn = () => {
    if (!process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID && !process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID) {
      Alert.alert(
        'Not Configured',
        'Set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID / EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID in your .env file.'
      );
      return;
    }
    promptGoogleAsync();
  };

  // ── Apple helper ──────────────────────────────────────────────────────────

  const handleAppleSignIn = async () => {
    if (!appleAvailable) {
      Alert.alert(
        'Apple Sign-In Unavailable',
        'Apple Sign-In requires an iOS device with a native (non-Expo-Go) build.'
      );
      return;
    }
    try {
      setIsSigningIn(true);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      await signInWithApple({
        identityToken: credential.identityToken,
        user:          credential.user,
        email:         credential.email,
        fullName:      credential.fullName,
      });
    } catch (error: any) {
      // ERR_CANCELED means the user dismissed the sheet — not a real error
      if (error.code !== 'ERR_CANCELED') {
        Alert.alert('Apple Sign-In Failed', error.message || 'Authentication failed');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  // ── Email helpers ─────────────────────────────────────────────────────────

  const handleEmailLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert('Error', 'Please enter your email and password');
      return;
    }
    try {
      setIsSigningIn(true);
      await signInWithEmail(email.trim(), password);
    } catch (error: any) {
      Alert.alert('Login Failed', error.message || 'Invalid email or password');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleEmailRegister = async () => {
    if (!name.trim() || !email.trim() || password.length < 6) {
      Alert.alert('Error', 'Please fill all fields (password min 6 characters)');
      return;
    }
    try {
      setIsSigningIn(true);
      await registerWithEmail(email.trim(), password, name.trim());
    } catch (error: any) {
      Alert.alert('Registration Failed', error.message || 'Could not create account');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleGuestMode = async () => {
    try {
      setIsSigningIn(true);
      await continueAsGuest();
    } catch {
      Alert.alert('Error', 'Failed to continue as guest');
    } finally {
      setIsSigningIn(false);
    }
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setName('');
    setShowPassword(false);
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const renderMainOptions = () => (
    <>
      {/* Logo */}
      <View style={styles.logoContainer}>
        <LinearGradient colors={['#7F52FF', '#9B7BFF']} style={styles.logoGradient}>
          <Ionicons name="wallet" size={48} color="#FFFFFF" />
        </LinearGradient>
        <Text style={styles.appTitle}>SAVIQ</Text>
        <Text style={styles.appSubtitle}>Smart spending, clearer decisions.</Text>
      </View>

      {/* Feature list */}
      <NeumorphicCard style={styles.featuresCard}>
        <FeatureRow icon="swap-horizontal" text="Expense, Income & Transfers" />
        <View style={styles.featureDivider} />
        <FeatureRow icon="scan" text="Scan receipts with AI" />
        <View style={styles.featureDivider} />
        <FeatureRow icon="repeat" text="Recurring transactions" />
        <View style={styles.featureDivider} />
        <FeatureRow icon="pie-chart" text="Beautiful analytics" />
      </NeumorphicCard>

      {/* Auth buttons */}
      <View style={styles.authSection}>
        <TouchableOpacity
          onPress={() => { resetForm(); setAuthMode('login'); }}
          disabled={isSigningIn}
        >
          <LinearGradient colors={['#7F52FF', '#6B42E0']} style={styles.primaryBtn}>
            <Ionicons name="mail-outline" size={20} color="#FFF" />
            <Text style={styles.primaryBtnText}>Sign in with Email</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.outlineBtn}
          onPress={() => { resetForm(); setAuthMode('register'); }}
          disabled={isSigningIn}
        >
          <Ionicons name="person-add-outline" size={20} color={lightTheme.colors.primary} />
          <Text style={styles.outlineBtnText}>Create Account</Text>
        </TouchableOpacity>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or continue with</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Social buttons */}
        <View style={styles.socialRow}>
          {/* Google */}
          <TouchableOpacity
            style={styles.socialBtn}
            onPress={handleGoogleSignIn}
            disabled={isSigningIn}
          >
            {isSigningIn ? (
              <ActivityIndicator size="small" color="#4285F4" />
            ) : (
              /* SVG-equivalent inline Google logo using text for simplicity */
              <Ionicons name="logo-google" size={22} color="#4285F4" />
            )}
          </TouchableOpacity>

          {/* Apple — only show if available */}
          {appleAvailable ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={16}
              style={styles.appleBtn}
              onPress={handleAppleSignIn}
            />
          ) : (
            Platform.OS === 'ios' && (
              <TouchableOpacity
                style={styles.socialBtn}
                onPress={handleAppleSignIn}
                disabled={isSigningIn}
              >
                <Ionicons name="logo-apple" size={22} color="#000" />
              </TouchableOpacity>
            )
          )}
        </View>

        <TouchableOpacity style={styles.guestBtn} onPress={handleGuestMode} disabled={isSigningIn}>
          {isSigningIn ? (
            <ActivityIndicator color={lightTheme.colors.textTertiary} />
          ) : (
            <>
              <Ionicons name="flash-outline" size={18} color={lightTheme.colors.textTertiary} />
              <Text style={styles.guestBtnText}>Continue as Guest</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.guestNote}>Data stored locally on your device</Text>
      </View>
    </>
  );

  const renderLoginForm = () => (
    <>
      <TouchableOpacity style={styles.backBtn} onPress={() => setAuthMode('main')}>
        <Ionicons name="chevron-back" size={24} color={lightTheme.colors.text} />
      </TouchableOpacity>

      <View style={styles.formHeader}>
        <Text style={styles.formTitle}>Welcome Back</Text>
        <Text style={styles.formSubtitle}>Sign in to continue</Text>
      </View>

      <NeumorphicCard style={styles.formCard}>
        <View style={styles.inputRow}>
          <Ionicons name="mail-outline" size={20} color={lightTheme.colors.textTertiary} />
          <TextInput
            style={styles.textInput}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={lightTheme.colors.placeholder}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={styles.inputDivider} />
        <View style={styles.inputRow}>
          <Ionicons name="lock-closed-outline" size={20} color={lightTheme.colors.textTertiary} />
          <TextInput
            style={styles.textInput}
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={lightTheme.colors.placeholder}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(v => !v)}>
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={lightTheme.colors.textTertiary}
            />
          </TouchableOpacity>
        </View>
      </NeumorphicCard>

      <TouchableOpacity onPress={handleEmailLogin} disabled={isSigningIn} style={styles.submitBtnContainer}>
        <LinearGradient
          colors={isSigningIn ? ['#C7C7CC', '#B0B0B5'] : ['#7F52FF', '#6B42E0']}
          style={styles.submitBtn}
        >
          {isSigningIn ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitBtnText}>Sign In</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => { resetForm(); setAuthMode('register'); }}>
        <Text style={styles.switchText}>
          Don't have an account?{' '}
          <Text style={styles.switchLink}>Create one</Text>
        </Text>
      </TouchableOpacity>
    </>
  );

  const renderRegisterForm = () => (
    <>
      <TouchableOpacity style={styles.backBtn} onPress={() => setAuthMode('main')}>
        <Ionicons name="chevron-back" size={24} color={lightTheme.colors.text} />
      </TouchableOpacity>

      <View style={styles.formHeader}>
        <Text style={styles.formTitle}>Create Account</Text>
        <Text style={styles.formSubtitle}>Start tracking your finances</Text>
      </View>

      <NeumorphicCard style={styles.formCard}>
        <View style={styles.inputRow}>
          <Ionicons name="person-outline" size={20} color={lightTheme.colors.textTertiary} />
          <TextInput
            style={styles.textInput}
            value={name}
            onChangeText={setName}
            placeholder="Full Name"
            placeholderTextColor={lightTheme.colors.placeholder}
            autoCapitalize="words"
          />
        </View>
        <View style={styles.inputDivider} />
        <View style={styles.inputRow}>
          <Ionicons name="mail-outline" size={20} color={lightTheme.colors.textTertiary} />
          <TextInput
            style={styles.textInput}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={lightTheme.colors.placeholder}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <View style={styles.inputDivider} />
        <View style={styles.inputRow}>
          <Ionicons name="lock-closed-outline" size={20} color={lightTheme.colors.textTertiary} />
          <TextInput
            style={styles.textInput}
            value={password}
            onChangeText={setPassword}
            placeholder="Password (min 6 characters)"
            placeholderTextColor={lightTheme.colors.placeholder}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(v => !v)}>
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={lightTheme.colors.textTertiary}
            />
          </TouchableOpacity>
        </View>
      </NeumorphicCard>

      <TouchableOpacity onPress={handleEmailRegister} disabled={isSigningIn} style={styles.submitBtnContainer}>
        <LinearGradient
          colors={isSigningIn ? ['#C7C7CC', '#B0B0B5'] : ['#34C759', '#2DB14F']}
          style={styles.submitBtn}
        >
          {isSigningIn ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitBtnText}>Create Account</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => { resetForm(); setAuthMode('login'); }}>
        <Text style={styles.switchText}>
          Already have an account?{' '}
          <Text style={styles.switchLink}>Sign in</Text>
        </Text>
      </TouchableOpacity>
    </>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={lightTheme.colors.background} />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {authMode === 'main'     && renderMainOptions()}
            {authMode === 'login'    && renderLoginForm()}
            {authMode === 'register' && renderRegisterForm()}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

function FeatureRow({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={20} color={lightTheme.colors.primary} />
      </View>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: lightTheme.colors.background },
  safeArea:        { flex: 1 },
  keyboardView:    { flex: 1 },
  scrollContent:   { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 20 },

  // Logo
  logoContainer: { alignItems: 'center', marginTop: 20, marginBottom: 32 },
  logoGradient: {
    width: 96, height: 96, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    shadowColor: '#7F52FF', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
  },
  appTitle:    { fontSize: 28, fontWeight: '800', color: lightTheme.colors.text, marginBottom: 4 },
  appSubtitle: { fontSize: 16, color: lightTheme.colors.textTertiary },

  // Features
  featuresCard: { marginBottom: 32 },
  featureRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  featureIcon:  {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: lightTheme.colors.primaryLight,
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  featureText:    { fontSize: 15, color: lightTheme.colors.textSecondary, flex: 1 },
  featureDivider: { height: 1, backgroundColor: lightTheme.colors.divider, marginLeft: 54 },

  // Auth section
  authSection: { gap: 12 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 14, gap: 10,
  },
  primaryBtnText: { fontSize: 17, fontWeight: '600', color: '#FFFFFF' },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 14, gap: 10,
    backgroundColor: lightTheme.colors.cardBackground,
    borderWidth: 1.5, borderColor: lightTheme.colors.primary,
  },
  outlineBtnText: { fontSize: 17, fontWeight: '600', color: lightTheme.colors.primary },

  dividerRow:  { flexDirection: 'row', alignItems: 'center', marginVertical: 8 },
  dividerLine: { flex: 1, height: 1, backgroundColor: lightTheme.colors.divider },
  dividerText: { color: lightTheme.colors.textTertiary, fontSize: 14, paddingHorizontal: 16 },

  socialRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 },
  socialBtn: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: lightTheme.colors.cardBackground,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  // Apple's own branded button
  appleBtn: { width: 140, height: 56 },

  guestBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 8, marginTop: 8,
  },
  guestBtnText: { fontSize: 15, color: lightTheme.colors.textTertiary, fontWeight: '500' },
  guestNote:    { fontSize: 12, color: lightTheme.colors.placeholder, textAlign: 'center' },

  // Form
  backBtn: {
    alignSelf: 'flex-start', width: 40, height: 40, borderRadius: 12,
    backgroundColor: lightTheme.colors.cardBackground,
    justifyContent: 'center', alignItems: 'center', marginBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  formHeader:   { marginBottom: 32 },
  formTitle:    { fontSize: 28, fontWeight: '800', color: lightTheme.colors.text, marginBottom: 4 },
  formSubtitle: { fontSize: 16, color: lightTheme.colors.textTertiary },
  formCard:     { marginBottom: 24 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 16, paddingHorizontal: 16, gap: 12,
  },
  inputDivider:      { height: 1, backgroundColor: lightTheme.colors.divider, marginLeft: 48 },
  textInput:         { flex: 1, fontSize: 16, color: lightTheme.colors.text },
  submitBtnContainer:{ marginBottom: 24 },
  submitBtn:         { paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  submitBtnText:     { fontSize: 17, fontWeight: '600', color: '#FFFFFF' },
  switchText:        { fontSize: 15, color: lightTheme.colors.textTertiary, textAlign: 'center' },
  switchLink:        { color: lightTheme.colors.primary, fontWeight: '600' },
});
