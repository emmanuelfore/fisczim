import { LocationObject } from 'expo-location';
import * as Location from 'expo-location';

export interface LocationData {
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy?: number;
  speed?: number;
  heading?: number;
}

class LocationTrackingService {
  private subscription: Location.LocationSubscription | null = null;
  private isTracking = false;
  private currentLocation: LocationData | null = null;
  private locationHistory: LocationData[] = [];
  private maxHistorySize = 100;

  async requestPermissions(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Location permission not granted');
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error requesting location permissions:', error);
      return false;
    }
  }

  async getCurrentLocation(): Promise<LocationData | null> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) return null;

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const locationData: LocationData = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        timestamp: new Date().toISOString(),
        accuracy: location.coords.accuracy ?? undefined,
        speed: location.coords.speed ?? undefined,
        heading: location.coords.heading ?? undefined,
      };

      this.currentLocation = locationData;
      return locationData;
    } catch (error) {
      console.error('Error getting current location:', error);
      return null;
    }
  }

  startTracking(callback?: (location: LocationData) => void): void {
    if (this.isTracking) {
      console.warn('Location tracking already started');
      return;
    }

    this.requestPermissions().then((hasPermission) => {
      if (!hasPermission) return;

      Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 30000, // Update every 30 seconds
          distanceInterval: 100, // Update every 100 meters
        },
        (location: LocationObject) => {
          const locationData: LocationData = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            timestamp: new Date().toISOString(),
            accuracy: location.coords.accuracy ?? undefined,
            speed: location.coords.speed ?? undefined,
            heading: location.coords.heading ?? undefined,
          };

          this.currentLocation = locationData;
          this.addToHistory(locationData);

          if (callback) {
            callback(locationData);
          }
        }
      ).then((sub) => {
        this.subscription = sub;
        this.isTracking = true;
        console.log('Location tracking started');
      });
    });
  }

  stopTracking(): void {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
      this.isTracking = false;
      console.log('Location tracking stopped');
    }
  }

  private addToHistory(location: LocationData): void {
    this.locationHistory.push(location);
    
    // Limit history size
    if (this.locationHistory.length > this.maxHistorySize) {
      this.locationHistory = this.locationHistory.slice(-this.maxHistorySize);
    }
  }

  getCurrentLocationData(): LocationData | null {
    return this.currentLocation;
  }

  getLocationHistory(): LocationData[] {
    return [...this.locationHistory];
  }

  clearHistory(): void {
    this.locationHistory = [];
  }

  isLocationTrackingActive(): boolean {
    return this.isTracking;
  }
}

// Singleton instance
export const locationTrackingService = new LocationTrackingService();
