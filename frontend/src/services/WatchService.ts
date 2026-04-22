import { Platform, NativeEventEmitter, NativeModules } from 'react-native';
import { EventEmitter } from 'events';

// For React Native Watch Connectivity
class WatchService extends EventEmitter {
  private static instance: WatchService;
  private watchEmitter: any;
  private isSupported = false;

  private constructor() {
    super();
    this.initializeWatchConnectivity();
  }

  static getInstance(): WatchService {
    if (!WatchService.instance) {
      WatchService.instance = new WatchService();
    }
    return WatchService.instance;
  }

  private initializeWatchConnectivity() {
    if (Platform.OS === 'ios') {
      try {
        const { WatchConnectivity } = NativeModules;
        if (WatchConnectivity) {
          this.isSupported = true;
          this.watchEmitter = new NativeEventEmitter(WatchConnectivity);
          this.setupWatchListeners();
          WatchConnectivity.activate();
        }
      } catch (error) {
        console.log('Watch connectivity not supported:', error);
      }
    }
  }

  private setupWatchListeners() {
    if (!this.watchEmitter) return;

    this.watchEmitter.addListener('messageReceived', (message: any) => {
      this.handleWatchMessage(message);
    });

    this.watchEmitter.addListener('watchAppInstalled', () => {
      console.log('Watch app installed');
    });
  }

  private handleWatchMessage(message: any) {
    switch (message.type) {
      case 'sos':
        this.emit('sos_from_watch', message);
        break;
      case 'location_request':
        this.emit('location_request');
        break;
      case 'route_preview':
        this.emit('route_preview_request');
        break;
    }
  }

  async sendRouteToWatch(route: any) {
    if (!this.isSupported) return false;
    
    const message = {
      type: 'route_preview',
      data: {
        start: route.start,
        end: route.end,
        waypoints: route.waypoints,
        duration: route.duration,
        distance: route.distance,
      },
    };
    
    try {
      await NativeModules.WatchConnectivity.sendMessage(message);
      return true;
    } catch (error) {
      console.error('Failed to send route to watch:', error);
      return false;
    }
  }

  async sendHapticAlert(alertType: 'danger' | 'warning' | 'info') {
    if (!this.isSupported) return;
    
    const hapticPatterns = {
      danger: [0, 200, 100, 200, 100, 200],
      warning: [0, 300, 100, 300],
      info: [0, 200],
    };
    
    const message = {
      type: 'haptic_alert',
      pattern: hapticPatterns[alertType],
    };
    
    try {
      await NativeModules.WatchConnectivity.sendMessage(message);
    } catch (error) {
      console.error('Failed to send haptic alert:', error);
    }
  }

  async sendLocationToWatch(location: any) {
    if (!this.isSupported) return;
    
    const message = {
      type: 'location_update',
      data: location,
    };
    
    try {
      await NativeModules.WatchConnectivity.sendMessage(message);
    } catch (error) {
      console.error('Failed to send location to watch:', error);
    }
  }
}

export default WatchService.getInstance();
