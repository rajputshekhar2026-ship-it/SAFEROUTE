// src/services/StorageService.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { EventEmitter } from 'events';

// Types
export interface StorageItem<T = any> {
  key: string;
  value: T;
  timestamp: number;
  expiresAt?: number;
  version?: number;
}

export interface StorageOptions {
  expiresIn?: number; // milliseconds
  version?: number;
  encrypt?: boolean;
}

export interface CacheConfig {
  maxSize: number; // in bytes
  maxAge: number; // in milliseconds
  cleanupInterval: number; // in milliseconds
}

export interface OfflineData {
  id: string;
  type: string;
  data: any;
  timestamp: number;
  synced: boolean;
}

// Storage Event Emitter
class StorageEventEmitter extends EventEmitter {
  private static instance: StorageEventEmitter;

  static getInstance(): StorageEventEmitter {
    if (!StorageEventEmitter.instance) {
      StorageEventEmitter.instance = new StorageEventEmitter();
    }
    return StorageEventEmitter.instance;
  }
}

export const storageEvents = StorageEventEmitter.getInstance();

class StorageServiceClass {
  private readonly APP_PREFIX = '@SafeRoute_';
  private readonly OFFLINE_QUEUE_KEY = `${this.APP_PREFIX}offline_queue`;
  private readonly CACHE_CONFIG_KEY = `${this.APP_PREFIX}cache_config`;
  private readonly VERSION_KEY = `${this.APP_PREFIX}storage_version`;
  private currentVersion = 1;
  private cacheConfig: CacheConfig = {
    maxSize: 50 * 1024 * 1024, // 50MB default
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    cleanupInterval: 60 * 60 * 1000, // 1 hour
  };
  private cleanupInterval: NodeJS.Timeout | null = null;
  private encryptionKey: string | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    await this.loadCacheConfig();
    await this.checkStorageVersion();
    this.startCleanupInterval();
  }

  /**
   * Check and migrate storage version if needed
   */
  private async checkStorageVersion(): Promise<void> {
    try {
      const savedVersion = await AsyncStorage.getItem(this.VERSION_KEY);
      const version = savedVersion ? parseInt(savedVersion, 10) : 1;
      
      if (version < this.currentVersion) {
        await this.migrateStorage(version, this.currentVersion);
        await AsyncStorage.setItem(this.VERSION_KEY, this.currentVersion.toString());
      }
    } catch (error) {
      console.error('Failed to check storage version:', error);
    }
  }

  /**
   * Migrate storage from old version to new version
   */
  private async migrateStorage(fromVersion: number, toVersion: number): Promise<void> {
    console.log(`Migrating storage from version ${fromVersion} to ${toVersion}`);
    // Implement migration logic based on version differences
    storageEvents.emit('storageMigrated', { fromVersion, toVersion });
  }

  /**
   * Load cache configuration
   */
  private async loadCacheConfig(): Promise<void> {
    try {
      const config = await AsyncStorage.getItem(this.CACHE_CONFIG_KEY);
      if (config) {
        this.cacheConfig = { ...this.cacheConfig, ...JSON.parse(config) };
      }
    } catch (error) {
      console.error('Failed to load cache config:', error);
    }
  }

  /**
   * Save cache configuration
   */
  async saveCacheConfig(config: Partial<CacheConfig>): Promise<void> {
    this.cacheConfig = { ...this.cacheConfig, ...config };
    await AsyncStorage.setItem(this.CACHE_CONFIG_KEY, JSON.stringify(this.cacheConfig));
    storageEvents.emit('cacheConfigUpdated', this.cacheConfig);
  }

  /**
   * Start automatic cleanup interval
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredItems();
    }, this.cacheConfig.cleanupInterval);
  }

  /**
   * Clean up expired items from storage
   */
  private async cleanupExpiredItems(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const prefixKeys = keys.filter(key => key.startsWith(this.APP_PREFIX));
      
      for (const key of prefixKeys) {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          try {
            const item: StorageItem = JSON.parse(value);
            if (item.expiresAt && Date.now() > item.expiresAt) {
              await AsyncStorage.removeItem(key);
              storageEvents.emit('itemExpired', { key });
            }
          } catch (e) {
            // Not a JSON stored item, skip
          }
        }
      }
      
      // Check storage size and clean if needed
      await this.checkStorageSize();
    } catch (error) {
      console.error('Failed to cleanup expired items:', error);
    }
  }

  /**
   * Check storage size and clean old items if over limit
   */
  private async checkStorageSize(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        // Web storage has different limits
        let totalSize = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(this.APP_PREFIX)) {
            const value = localStorage.getItem(key);
            if (value) {
              totalSize += value.length * 2; // Approximate size in bytes
            }
          }
        }
        
        if (totalSize > this.cacheConfig.maxSize) {
          await this.cleanOldestItems();
        }
      }
    } catch (error) {
      console.error('Failed to check storage size:', error);
    }
  }

  /**
   * Clean oldest items when storage is full
   */
  private async cleanOldestItems(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const prefixKeys = keys.filter(key => key.startsWith(this.APP_PREFIX));
      const items: { key: string; timestamp: number }[] = [];
      
      for (const key of prefixKeys) {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          try {
            const item: StorageItem = JSON.parse(value);
            items.push({ key, timestamp: item.timestamp });
          } catch (e) {
            items.push({ key, timestamp: 0 });
          }
        }
      }
      
      // Sort by timestamp (oldest first)
      items.sort((a, b) => a.timestamp - b.timestamp);
      
      // Remove oldest 20% of items
      const toRemove = Math.floor(items.length * 0.2);
      for (let i = 0; i < toRemove; i++) {
        await AsyncStorage.removeItem(items[i].key);
        storageEvents.emit('itemRemovedForSpace', { key: items[i].key });
      }
    } catch (error) {
      console.error('Failed to clean oldest items:', error);
    }
  }

  /**
   * Set item in storage
   */
  async setItem<T>(
    key: string,
    value: T,
    options: StorageOptions = {}
  ): Promise<void> {
    const fullKey = this.getFullKey(key);
    const item: StorageItem<T> = {
      key: fullKey,
      value,
      timestamp: Date.now(),
      expiresAt: options.expiresIn ? Date.now() + options.expiresIn : undefined,
      version: options.version || this.currentVersion,
    };

    try {
      let dataToStore = JSON.stringify(item);
      
      if (options.encrypt && this.encryptionKey) {
        dataToStore = await this.encrypt(dataToStore);
      }
      
      await AsyncStorage.setItem(fullKey, dataToStore);
      storageEvents.emit('itemSet', { key: fullKey, size: dataToStore.length });
    } catch (error) {
      console.error(`Failed to set item ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get item from storage
   */
  async getItem<T>(key: string, decrypt: boolean = false): Promise<T | null> {
    const fullKey = this.getFullKey(key);
    
    try {
      let value = await AsyncStorage.getItem(fullKey);
      if (!value) return null;
      
      if (decrypt && this.encryptionKey) {
        value = await this.decrypt(value);
      }
      
      const item: StorageItem<T> = JSON.parse(value);
      
      // Check if expired
      if (item.expiresAt && Date.now() > item.expiresAt) {
        await AsyncStorage.removeItem(fullKey);
        storageEvents.emit('itemExpired', { key: fullKey });
        return null;
      }
      
      return item.value;
    } catch (error) {
      console.error(`Failed to get item ${key}:`, error);
      return null;
    }
  }

  /**
   * Remove item from storage
   */
  async removeItem(key: string): Promise<void> {
    const fullKey = this.getFullKey(key);
    await AsyncStorage.removeItem(fullKey);
    storageEvents.emit('itemRemoved', { key: fullKey });
  }

  /**
   * Clear all app storage
   */
  async clearAll(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const prefixKeys = keys.filter(key => key.startsWith(this.APP_PREFIX));
      await AsyncStorage.multiRemove(prefixKeys);
      storageEvents.emit('storageCleared');
    } catch (error) {
      console.error('Failed to clear storage:', error);
    }
  }

  /**
   * Get all keys
   */
  async getAllKeys(): Promise<string[]> {
    const keys = await AsyncStorage.getAllKeys();
    return keys.filter(key => key.startsWith(this.APP_PREFIX)).map(key => key.replace(this.APP_PREFIX, ''));
  }

  /**
   * Get storage size information
   */
  async getStorageInfo(): Promise<{ totalItems: number; totalSize: number }> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const prefixKeys = keys.filter(key => key.startsWith(this.APP_PREFIX));
      let totalSize = 0;
      
      for (const key of prefixKeys) {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          totalSize += value.length;
        }
      }
      
      return {
        totalItems: prefixKeys.length,
        totalSize: totalSize * 2, // Approximate bytes (UTF-16)
      };
    } catch (error) {
      console.error('Failed to get storage info:', error);
      return { totalItems: 0, totalSize: 0 };
    }
  }

  /**
   * Add to offline queue for later sync
   */
  async addToOfflineQueue(data: OfflineData): Promise<void> {
    try {
      const queue = await this.getOfflineQueue();
      queue.push(data);
      await AsyncStorage.setItem(this.OFFLINE_QUEUE_KEY, JSON.stringify(queue));
      storageEvents.emit('offlineQueueUpdated', { queueLength: queue.length });
    } catch (error) {
      console.error('Failed to add to offline queue:', error);
    }
  }

  /**
   * Get offline queue
   */
  async getOfflineQueue(): Promise<OfflineData[]> {
    try {
      const queue = await AsyncStorage.getItem(this.OFFLINE_QUEUE_KEY);
      return queue ? JSON.parse(queue) : [];
    } catch (error) {
      console.error('Failed to get offline queue:', error);
      return [];
    }
  }

  /**
   * Remove from offline queue
   */
  async removeFromOfflineQueue(id: string): Promise<void> {
    try {
      let queue = await this.getOfflineQueue();
      queue = queue.filter(item => item.id !== id);
      await AsyncStorage.setItem(this.OFFLINE_QUEUE_KEY, JSON.stringify(queue));
      storageEvents.emit('offlineQueueUpdated', { queueLength: queue.length });
    } catch (error) {
      console.error('Failed to remove from offline queue:', error);
    }
  }

  /**
   * Clear offline queue
   */
  async clearOfflineQueue(): Promise<void> {
    await AsyncStorage.removeItem(this.OFFLINE_QUEUE_KEY);
    storageEvents.emit('offlineQueueCleared');
  }

  /**
   * Save file to device storage
   */
  async saveFile(uri: string, fileName: string, directory: string = 'SafeRoute'): Promise<string | null> {
    try {
      const documentsDir = FileSystem.documentDirectory;
      const appDir = `${documentsDir}${directory}/`;
      const destination = `${appDir}${fileName}`;
      
      // Create directory if it doesn't exist
      const dirInfo = await FileSystem.getInfoAsync(appDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(appDir, { intermediates: true });
      }
      
      // Copy file
      await FileSystem.copyAsync({
        from: uri,
        to: destination,
      });
      
      storageEvents.emit('fileSaved', { fileName, destination });
      return destination;
    } catch (error) {
      console.error('Failed to save file:', error);
      return null;
    }
  }

  /**
   * Delete file from device storage
   */
  async deleteFile(filePath: string): Promise<boolean> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(filePath);
        storageEvents.emit('fileDeleted', { filePath });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to delete file:', error);
      return false;
    }
  }

  /**
   * Cache map data for offline use
   */
  async cacheMapData(region: string, data: any): Promise<void> {
    const cacheKey = `map_cache_${region}`;
    await this.setItem(cacheKey, data, { expiresIn: 7 * 24 * 60 * 60 * 1000 }); // 7 days
  }

  /**
   * Get cached map data
   */
  async getCachedMapData(region: string): Promise<any | null> {
    const cacheKey = `map_cache_${region}`;
    return await this.getItem(cacheKey);
  }

  /**
   * Cache safe zones for offline use
   */
  async cacheSafeZones(zones: any[]): Promise<void> {
    await this.setItem('safe_zones', zones, { expiresIn: 24 * 60 * 60 * 1000 }); // 24 hours
  }

  /**
   * Get cached safe zones
   */
  async getCachedSafeZones(): Promise<any[] | null> {
    return await this.getItem('safe_zones');
  }

  /**
   * Cache route data for offline use
   */
  async cacheRoute(routeId: string, routeData: any): Promise<void> {
    const cacheKey = `route_${routeId}`;
    await this.setItem(cacheKey, routeData, { expiresIn: 1 * 60 * 60 * 1000 }); // 1 hour
  }

  /**
   * Get cached route
   */
  async getCachedRoute(routeId: string): Promise<any | null> {
    const cacheKey = `route_${routeId}`;
    return await this.getItem(cacheKey);
  }

  /**
   * Batch get multiple items
   */
  async multiGet(keys: string[]): Promise<Record<string, any>> {
    const fullKeys = keys.map(key => this.getFullKey(key));
    const result = await AsyncStorage.multiGet(fullKeys);
    
    const output: Record<string, any> = {};
    for (const [key, value] of result) {
      if (value) {
        try {
          const item: StorageItem = JSON.parse(value);
          if (!item.expiresAt || Date.now() <= item.expiresAt) {
            const originalKey = key.replace(this.APP_PREFIX, '');
            output[originalKey] = item.value;
          }
        } catch (e) {
          // Not a JSON stored item
          const originalKey = key.replace(this.APP_PREFIX, '');
          output[originalKey] = value;
        }
      }
    }
    
    return output;
  }

  /**
   * Batch set multiple items
   */
  async multiSet(items: Record<string, any>, options: StorageOptions = {}): Promise<void> {
    const entries = Object.entries(items);
    const storageItems: [string, string][] = [];
    
    for (const [key, value] of entries) {
      const fullKey = this.getFullKey(key);
      const item: StorageItem = {
        key: fullKey,
        value,
        timestamp: Date.now(),
        expiresAt: options.expiresIn ? Date.now() + options.expiresIn : undefined,
        version: options.version || this.currentVersion,
      };
      storageItems.push([fullKey, JSON.stringify(item)]);
    }
    
    await AsyncStorage.multiSet(storageItems);
    storageEvents.emit('multiSet', { count: storageItems.length });
  }

  /**
   * Batch remove multiple items
   */
  async multiRemove(keys: string[]): Promise<void> {
    const fullKeys = keys.map(key => this.getFullKey(key));
    await AsyncStorage.multiRemove(fullKeys);
    storageEvents.emit('multiRemove', { count: fullKeys.length });
  }

  /**
   * Get full storage key with app prefix
   */
  private getFullKey(key: string): string {
    return `${this.APP_PREFIX}${key}`;
  }

  /**
   * Encrypt data (placeholder - implement actual encryption)
   */
  private async encrypt(data: string): Promise<string> {
    // In production, implement proper encryption
    // This is a placeholder
    return data;
  }

  /**
   * Decrypt data (placeholder - implement actual decryption)
   */
  private async decrypt(data: string): Promise<string> {
    // In production, implement proper decryption
    // This is a placeholder
    return data;
  }

  /**
   * Set encryption key for secure storage
   */
  setEncryptionKey(key: string): void {
    this.encryptionKey = key;
  }

  /**
   * Stop cleanup interval
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Export singleton instance
export const StorageService = new StorageServiceClass();
export default StorageService;
