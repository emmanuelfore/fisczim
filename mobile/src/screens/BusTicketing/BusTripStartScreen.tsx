import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBusTicketing } from '../../hooks/useBusTicketing';
import { BusTrip } from '../../types/busTicketing';

const C = {
  bg: '#07090C',
  surface: '#111318',
  border: '#1E2128',
  amber: '#F0A500',
  fire: '#FF6B35',
  white: '#FFFFFF',
  muted: '#9CA3AF',
  success: '#22C55E',
  danger: '#EF4444',
};

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

interface Props {
  onClose: () => void;
}

export function BusTripStartScreen({ onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { routes, vehicles, activeConductor, startTrip } = useBusTicketing();
  
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const activeRoutes = routes.filter(r => r.isActive);
  const activeVehicles = vehicles.filter(v => v.isActive);

  async function handleStartTrip() {
    if (!activeConductor) {
      Alert.alert("Error", "You must be an active conductor to start a trip.");
      return;
    }
    if (!selectedRouteId || !selectedVehicleId) {
      Alert.alert("Validation", "Please select both a Route and a Vehicle.");
      return;
    }

    const trip: BusTrip = {
      id: uuid(),
      routeId: selectedRouteId,
      vehicleId: selectedVehicleId,
      conductorId: activeConductor.id,
      status: 'in_progress',
      scheduledDeparture: new Date().toISOString(),
      actualDeparture: new Date().toISOString(),
    };

    try {
      await startTrip(trip);
      Alert.alert("Success", "Trip started successfully!", [
        { text: "OK", onPress: onClose }
      ]);
    } catch (e: any) {
      Alert.alert("Cannot Start Trip", e.message);
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Start Trip</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Step 1: Route */}
        <Text style={styles.sectionHeader}>1. SELECT ROUTE</Text>
        {activeRoutes.length === 0 ? (
          <Text style={styles.emptyText}>No active routes available. An admin must configure routes first.</Text>
        ) : (
          <View style={styles.grid}>
            {activeRoutes.map(route => (
              <TouchableOpacity
                key={route.id}
                style={[styles.card, selectedRouteId === route.id && styles.cardActive]}
                onPress={() => setSelectedRouteId(route.id)}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="map-marker-path" size={20} color={selectedRouteId === route.id ? C.amber : C.muted} />
                  <Text style={styles.cardPrice}>${route.price.toFixed(2)}</Text>
                </View>
                <Text style={styles.cardTitle}>{route.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Step 2: Vehicle */}
        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>2. SELECT VEHICLE</Text>
        {activeVehicles.length === 0 ? (
          <Text style={styles.emptyText}>No active vehicles available. An admin must configure the fleet first.</Text>
        ) : (
          <View style={styles.grid}>
            {activeVehicles.map(vehicle => (
              <TouchableOpacity
                key={vehicle.id}
                style={[styles.card, selectedVehicleId === vehicle.id && styles.cardActive]}
                onPress={() => setSelectedVehicleId(vehicle.id)}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeader}>
                  <MaterialCommunityIcons name="bus" size={20} color={selectedVehicleId === vehicle.id ? C.amber : C.muted} />
                  {vehicle.capacity && <Text style={styles.cardSubText}>{vehicle.capacity} seats</Text>}
                </View>
                <Text style={styles.cardTitle}>{vehicle.registrationNumber}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Start Button Fixed at Bottom */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.startBtn, (!selectedRouteId || !selectedVehicleId) && styles.startBtnDisabled]}
          onPress={handleStartTrip}
          disabled={!selectedRouteId || !selectedVehicleId}
        >
          <MaterialCommunityIcons name="steering" size={22} color={(!selectedRouteId || !selectedVehicleId) ? C.muted : '#000'} />
          <Text style={[styles.startBtnText, (!selectedRouteId || !selectedVehicleId) && { color: C.muted }]}>START TRIP</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: C.white, fontSize: 18, fontWeight: '800' },
  sectionHeader: {
    color: C.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.2,
    marginBottom: 14, textTransform: 'uppercase',
  },
  emptyText: { color: C.muted, fontSize: 14, fontStyle: 'italic', marginBottom: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '48%', backgroundColor: C.surface, borderRadius: 12, padding: 16,
    borderWidth: 2, borderColor: C.border,
  },
  cardActive: { borderColor: C.amber, backgroundColor: 'rgba(240,165,0,0.05)' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardTitle: { color: C.white, fontSize: 15, fontWeight: '800' },
  cardPrice: { color: C.success, fontSize: 13, fontWeight: '700' },
  cardSubText: { color: C.muted, fontSize: 12 },
  footer: { paddingHorizontal: 20, paddingTop: 16, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border },
  startBtn: {
    backgroundColor: C.amber, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 14,
  },
  startBtnDisabled: { backgroundColor: C.surface, borderColor: C.border, borderWidth: 1 },
  startBtnText: { color: '#000', fontSize: 16, fontWeight: '900', letterSpacing: 0.5 },
});
