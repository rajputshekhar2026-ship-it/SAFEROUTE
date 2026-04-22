import React from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');

interface BottomActionBarProps {
  onEmergency: () => void;
  onCheckIn: () => void;
  onReRoute: () => void;
  onFakeCall: () => void;
  onSOSMessage: () => void;
}

const BottomActionBar: React.FC<BottomActionBarProps> = ({
  onEmergency,
  onCheckIn,
  onReRoute,
  onFakeCall,
  onSOSMessage,
}) => {
  const handlePress = (callback: () => void, hapticType: any = Haptics.ImpactFeedbackStyle.Light) => {
    Haptics.impactAsync(hapticType);
    callback();
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, styles.emergencyButton]}
        onPress={() => handlePress(onEmergency, Haptics.ImpactFeedbackStyle.Heavy)}
      >
        <Text style={styles.buttonText}>🚨 EMERGENCY</Text>
      </TouchableOpacity>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => handlePress(onCheckIn)}
        >
          <Text style={styles.buttonText}>✅ CHECK-IN</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => handlePress(onReRoute)}
        >
          <Text style={styles.buttonText}>🔄 RE-ROUTE</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => handlePress(onFakeCall)}
        >
          <Text style={styles.buttonText}>📞 FAKE CALL</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => handlePress(onSOSMessage)}
        >
          <Text style={styles.buttonText}>✉️ SOS MSG</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.9)',
    padding: 10,
    paddingBottom: height > 800 ? 30 : 10,
  },
  emergencyButton: {
    backgroundColor: '#FF0000',
    marginBottom: 10,
    paddingVertical: 15,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  button: {
    flex: 1,
    backgroundColor: '#333',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default BottomActionBar;
