import fs from 'fs';

const filePath = './mobile/src/screens/BusTicketing/TripManifestScreen.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const importTarget = `import { type BusColors, useBusColors } from './theme';`;
const importReplacement = `import { type BusColors, useBusColors } from './theme';
import DateTimePicker from '@react-native-community/datetimepicker';`;
content = content.replace(importTarget, importReplacement);

const stateTarget = `  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);`;
const stateReplacement = `  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);`;
content = content.replace(stateTarget, stateReplacement);

const filteredTripsTarget = `  const tripsWithTickets = useMemo(() => {
    const tripIds = new Set(tickets.map((t) => t.tripId).filter(Boolean));
    return trips
      .filter((t) => tripIds.has(t.id))
      .sort((a, b) => new Date(b.scheduledDeparture).getTime() - new Date(a.scheduledDeparture).getTime());
  }, [trips, tickets]);`;

const filteredTripsReplacement = `  const tripsWithTickets = useMemo(() => {
    const tripIds = new Set(tickets.map((t) => t.tripId).filter(Boolean));
    const filterDateStr = filterDate.toISOString().slice(0, 10);
    return trips
      .filter((t) => tripIds.has(t.id))
      .filter((t) => t.scheduledDeparture.startsWith(filterDateStr))
      .sort((a, b) => new Date(b.scheduledDeparture).getTime() - new Date(a.scheduledDeparture).getTime());
  }, [trips, tickets, filterDate]);`;
content = content.replace(filteredTripsTarget, filteredTripsReplacement);

const uiTarget = `        {/* Trip picker */}
        <Text style={styles.sectionTitle}>SELECT TRIP</Text>
        {tripsWithTickets.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="bus-clock" size={48} color={C.border} />
            <Text style={styles.emptyText}>No trips with tickets yet</Text>
          </View>
        ) : (
          tripsWithTickets.slice(0, 30).map((trip) => {
            const active = trip.id === selectedTripId;
            return (
              <TouchableOpacity
                key={trip.id}
                style={[styles.tripCard, active && { borderColor: C.amber }]}
                onPress={() => setSelectedTripId(active ? null : trip.id)}
              >
                <MaterialCommunityIcons
                  name={active ? 'checkbox-marked-circle-outline' : 'checkbox-blank-circle-outline'}
                  size={18}
                  color={active ? C.amber : C.muted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.tripName} numberOfLines={1}>{trip.id}</Text>
                  <Text style={styles.tripSub}>
                    {fmtDate(new Date(trip.scheduledDeparture))} {fmtTime(trip.scheduledDeparture)} · {String(trip.status || '').replace('_', ' ')}
                  </Text>
                </View>
                <Text style={styles.tripTickets}>
                  {tickets.filter((t) => t.tripId === trip.id).length} tkts
                </Text>
              </TouchableOpacity>
            );
          })
        )}`;

const uiReplacement = `        {/* Trip picker */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 14 }}>
          <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>SELECT TRIP</Text>
          <TouchableOpacity 
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: C.border }}
            onPress={() => setShowDatePicker(true)}
          >
            <MaterialCommunityIcons name="calendar-filter" size={16} color={C.amber} />
            <Text style={{ color: C.white, fontSize: 12, fontWeight: '700' }}>{fmtDate(filterDate)}</Text>
          </TouchableOpacity>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={filterDate}
            mode="date"
            display="default"
            onChange={(event, date) => {
              setShowDatePicker(false);
              if (date) {
                setFilterDate(date);
                setSelectedTripId(null); // Reset selection when date changes
              }
            }}
          />
        )}

        {tripsWithTickets.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="bus-clock" size={48} color={C.border} />
            <Text style={styles.emptyText}>No trips found for {fmtDate(filterDate)}</Text>
          </View>
        ) : (
          tripsWithTickets.slice(0, 30).map((trip) => {
            const active = trip.id === selectedTripId;
            const route = routes.find(r => r.id === trip.routeId);
            const vehicle = vehicles.find(v => v.id === trip.vehicleId);
            return (
              <TouchableOpacity
                key={trip.id}
                style={[styles.tripCard, active && { borderColor: C.amber }]}
                onPress={() => setSelectedTripId(active ? null : trip.id)}
              >
                <MaterialCommunityIcons
                  name={active ? 'checkbox-marked-circle-outline' : 'checkbox-blank-circle-outline'}
                  size={18}
                  color={active ? C.amber : C.muted}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.tripName} numberOfLines={1}>{route?.name || \`Trip \${trip.id.substring(0,8)}\`}</Text>
                  <Text style={styles.tripSub}>
                    {vehicle?.registrationNumber || 'Unknown Bus'} · {fmtTime(trip.scheduledDeparture)} · {String(trip.status || '').replace('_', ' ')}
                  </Text>
                </View>
                <Text style={styles.tripTickets}>
                  {tickets.filter((t) => t.tripId === trip.id).length} tkts
                </Text>
              </TouchableOpacity>
            );
          })
        )}`;

content = content.replace(uiTarget, uiReplacement);

fs.writeFileSync(filePath, content);
