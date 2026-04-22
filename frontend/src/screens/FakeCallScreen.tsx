import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Animated,
  Vibration,
} from 'react-native';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

interface FakeContact {
  name: string;
  photo: string;
  relationship: string;
}

const fakeContacts: FakeContact[] = [
  { name: 'Mom', photo: '👩', relationship: 'Mother' },
  { name: 'Brother', photo: '👨', relationship: 'Sibling' },
  { name: 'Friend Sarah', photo: '👩', relationship: 'Friend' },
  { name: 'Police', photo: '👮', relationship: 'Emergency' },
];

const conversationPrompts = [
  "I'm on my way home, should be there in 15 minutes",
  "Yes, I'm walking on Main Street right now",
  "Can you stay on the phone with me until I get home?",
  "There's someone following me, I'm going to the police station",
  "I see a well-lit area ahead, I'm heading there",
];

const FakeCallScreen: React.FC<{ navigation: any; route: any }> = ({ navigation, route }) => {
  const [contact, setContact] = useState<FakeContact | null>(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState(0);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const shakeAnimation = new Animated.Value(0);

  useEffect(() => {
    const selectedContact = route.params?.contact || fakeContacts[0];
    setContact(selectedContact);
    playRingtone();
    startVibration();
    startAnimation();

    return () => {
      if (sound) {
        sound.unloadAsync();
      }
      Vibration.cancel();
    };
  }, []);

  const playRingtone = async () => {
    const { sound: ringtoneSound } = await Audio.Sound.createAsync(
      require('../assets/ringtone.mp3'),
      { shouldPlay: true, isLooping: true }
    );
    setSound(ringtoneSound);
  };

  const startVibration = () => {
    Vibration.vibrate([1000, 500, 1000, 500], true);
  };

  const startAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shakeAnimation, {
          toValue: 10,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnimation, {
          toValue: -10,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(shakeAnimation, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const acceptCall = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCallAccepted(true);
    if (sound) {
      sound.stopAsync();
      sound.unloadAsync();
    }
    Vibration.cancel();
    
    // Start conversation prompts
    const interval = setInterval(() => {
      setCurrentPrompt(prev => {
        if (prev >= conversationPrompts.length - 1) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 5000);
  };

  const declineCall = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.goBack();
  };

  if (!contact) return null;

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.callContainer,
          {
            transform: [{ translateX: shakeAnimation }],
          },
        ]}
      >
        {!callAccepted ? (
          // Incoming call UI
          <View style={styles.incomingCall}>
            <Text style={styles.contactName}>{contact.name}</Text>
            <Text style={styles.contactRelation}>{contact.relationship}</Text>
            <Text style={styles.callStatus}>Incoming call...</Text>
            
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.callButton, styles.acceptButton]}
                onPress={acceptCall}
              >
                <Text style={styles.buttonText}>Accept</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.callButton, styles.declineButton]}
                onPress={declineCall}
              >
                <Text style={styles.buttonText}>Decline</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          // Active call UI
          <View style={styles.activeCall}>
            <Text style={styles.contactName}>{contact.name}</Text>
            <Text style={styles.callDuration}>00:00</Text>
            
            <View style={styles.conversationContainer}>
              <Text style={styles.conversationText}>
                {conversationPrompts[currentPrompt]}
              </Text>
            </View>
            
            <TouchableOpacity
              style={styles.endCallButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.endCallText}>End Call</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  callContainer: {
    width: '90%',
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
  },
  incomingCall: {
    alignItems: 'center',
    width: '100%',
  },
  activeCall: {
    alignItems: 'center',
    width: '100%',
  },
  contactName: {
    fontSize: 32,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 10,
  },
  contactRelation: {
    fontSize: 18,
    color: '#888',
    marginBottom: 20,
  },
  callStatus: {
    fontSize: 16,
    color: '#4CAF50',
    marginBottom: 30,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 20,
  },
  callButton: {
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    minWidth: 120,
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  declineButton: {
    backgroundColor: '#f44336',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  callDuration: {
    fontSize: 24,
    color: '#4CAF50',
    marginBottom: 30,
  },
  conversationContainer: {
    backgroundColor: '#333',
    padding: 20,
    borderRadius: 15,
    marginVertical: 30,
    minHeight: 100,
    justifyContent: 'center',
  },
  conversationText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
  },
  endCallButton: {
    backgroundColor: '#f44336',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 25,
    marginTop: 20,
  },
  endCallText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default FakeCallScreen;
