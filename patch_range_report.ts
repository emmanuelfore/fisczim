import fs from 'fs';

const filePath = './mobile/src/screens/BusTicketing/BusRangeReportScreen.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const importTarget = `import { LineChart } from 'react-native-gifted-charts';`;
const importReplacement = `import { LineChart } from 'react-native-gifted-charts';
import DateTimePicker from '@react-native-community/datetimepicker';`;
content = content.replace(importTarget, importReplacement);

const stateTarget = `  const [selectingFrom, setSelectingFrom] = useState(false);`;
const stateReplacement = `  const [selectingFrom, setSelectingFrom] = useState(false);
  const [selectingTo, setSelectingTo] = useState(false);`;
content = content.replace(stateTarget, stateReplacement);

const uiTarget = `        <View style={styles.dateRange}>
          <View style={styles.datePickerGroup}>
            <Text style={styles.datePickerLabel}>FROM</Text>
            <View style={styles.datePickerRow}>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => setFromDate((d) => addDays(d, -1))}>
                <MaterialCommunityIcons name="chevron-left" size={20} color={C.white} />
              </TouchableOpacity>
              <Text style={styles.datePickerValue}>{fmtDate(fromDate)}</Text>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => setFromDate((d) => { const n = addDays(d,1); return n < toDate ? n : d; })}>
                <MaterialCommunityIcons name="chevron-right" size={20} color={C.white} />
              </TouchableOpacity>
            </View>
          </View>
          <MaterialCommunityIcons name="arrow-right" size={20} color={C.muted} />
          <View style={styles.datePickerGroup}>
            <Text style={styles.datePickerLabel}>TO</Text>
            <View style={styles.datePickerRow}>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => setToDate((d) => { const n = addDays(d,-1); return n > fromDate ? n : d; })}>
                <MaterialCommunityIcons name="chevron-left" size={20} color={C.white} />
              </TouchableOpacity>
              <Text style={styles.datePickerValue}>{fmtDate(toDate)}</Text>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => setToDate((d) => addDays(d,1))} disabled={toDate >= today}>
                <MaterialCommunityIcons name="chevron-right" size={20} color={toDate >= today ? C.border : C.white} />
              </TouchableOpacity>
            </View>
          </View>
        </View>`;

const uiReplacement = `        <View style={styles.dateRange}>
          <View style={styles.datePickerGroup}>
            <Text style={styles.datePickerLabel}>FROM</Text>
            <View style={styles.datePickerRow}>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => setFromDate((d) => addDays(d, -1))}>
                <MaterialCommunityIcons name="chevron-left" size={20} color={C.white} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSelectingFrom(true)} style={{flex:1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4}}>
                <MaterialCommunityIcons name="calendar" size={14} color={C.amber} />
                <Text style={styles.datePickerValue}>{fmtDate(fromDate)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => setFromDate((d) => { const n = addDays(d,1); return n < toDate ? n : d; })}>
                <MaterialCommunityIcons name="chevron-right" size={20} color={C.white} />
              </TouchableOpacity>
            </View>
          </View>
          <MaterialCommunityIcons name="arrow-right" size={20} color={C.muted} />
          <View style={styles.datePickerGroup}>
            <Text style={styles.datePickerLabel}>TO</Text>
            <View style={styles.datePickerRow}>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => setToDate((d) => { const n = addDays(d,-1); return n > fromDate ? n : d; })}>
                <MaterialCommunityIcons name="chevron-left" size={20} color={C.white} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSelectingTo(true)} style={{flex:1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4}}>
                <MaterialCommunityIcons name="calendar" size={14} color={C.amber} />
                <Text style={styles.datePickerValue}>{fmtDate(toDate)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.arrowBtn} onPress={() => setToDate((d) => addDays(d,1))} disabled={toDate >= today}>
                <MaterialCommunityIcons name="chevron-right" size={20} color={toDate >= today ? C.border : C.white} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {selectingFrom && (
          <DateTimePicker
            value={fromDate}
            mode="date"
            display="default"
            maximumDate={toDate}
            onChange={(event, date) => {
              setSelectingFrom(false);
              if (date) setFromDate(date);
            }}
          />
        )}
        {selectingTo && (
          <DateTimePicker
            value={toDate}
            mode="date"
            display="default"
            minimumDate={fromDate}
            maximumDate={today}
            onChange={(event, date) => {
              setSelectingTo(false);
              if (date) setToDate(date);
            }}
          />
        )}`;
content = content.replace(uiTarget, uiReplacement);

fs.writeFileSync(filePath, content);
