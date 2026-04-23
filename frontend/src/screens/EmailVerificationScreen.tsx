// frontend/src/screens/EmailVerificationScreen.tsx

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../hooks/useAuth';

interface EmailVerificationScreenProps {
  navigation: any;
  route: {
    params: {
      email: string;
    };
  };
}

const EmailVerificationScreen: React.FC<EmailVerificationScreenProps> = ({ navigation, route }) => {
  const { email } = route.params;
  const { verifyEmail, resendVerification, isLoading } = useAuth();
  
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [timer, setTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    startTimer();
  }, []);

  const startTimer = () => {
    setTimer(60);
    setCanResend(false);
    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  };

  const handleOtpChange = (text: string, index: number) => {
    if (text.length > 1) {
      text = text[0];
    }
    
    const newOtp = [...otp];
    newOtp[index] = text;
    setOtp(newOtp);
    
    // Auto-focus next input
    if (text && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
    
    // Auto-submit when all digits are filled
    if (index === 5 && text && newOtp.every(digit => digit !== '')) {
      handleVerify();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    const otpString = otp.join('');
    if (otpString.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit verification code');
      return;
    }
    
    setIsVerifying(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      await verifyEmail(email, otpString);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.replace('Main');
    } catch (error: any) {
      Alert.alert('Verification Failed', error.message || 'Invalid verification code');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    
    setIsResending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    try {
      await resendVerification(email);
      startTimer();
      Alert.alert('Code Sent', 'A new verification code has been sent to your email');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to resend verification code');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={['#1a1a2e', '#16213e', '#0f3460']}
        style={styles.gradient}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Verify Your Email</Text>
            <Text style={styles.subtitle}>
              We've sent a 6-digit verification code to
            </Text>
            <Text style={styles.emailText}>{email}</Text>
          </View>

          <View style={styles.otpContainer}>
            {otp.map((digit, index) => (
              <TextInput
                key={index}
                ref={(ref) => (inputRefs.current[index] = ref)}
                style={styles.otpInput}
                value={digit}
                onChangeText={(text) => handleOtpChange(text, index)}
                onKeyPress={(e) => handleKeyPress(e, index)}
                keyboardType="number-pad"
                maxLength={1}
                textAlign="center"
                editable={!isVerifying}
              />
            ))}
          </View>

          <TouchableOpacity
            style={[styles.verifyButton, (isVerifying || otp.some(d => d === '')) && styles.verifyButtonDisabled]}
            onPress={handleVerify}
            disabled={isVerifying || otp.some(d => d === '')}
          >
            <LinearGradient
              colors={['#e94560', '#c73e54']}
              style={styles.verifyGradient}
            >
              {isVerifying ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.verifyText}>Verify Email</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.resendContainer}>
            <Text style={styles.resendText}>Didn't receive the code? </Text>
            {canResend ? (
              <TouchableOpacity onPress={handleResend} disabled={isResending}>
                <Text style={styles.resendLink}>
                  {isResending ? 'Sending...' : 'Resend'}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.timerText}>Resend in {timer}s</Text>
            )}
          </View>

          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backText}>← Back to Login</Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  emailText: {
    fontSize: 18,
    color: '#e94560',
    fontWeight: '600',
    marginTop: 8,
  },
  otpContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  otpInput: {
    width: 50,
    height: 55,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  verifyButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 20,
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  verifyText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  resendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resendText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
  },
  resendLink: {
    color: '#e94560',
    fontSize: 14,
    fontWeight: '600',
  },
  timerText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  backButton: {
    alignItems: 'center',
    marginTop: 30,
  },
  backText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
  },
});

export default EmailVerificationScreen;
