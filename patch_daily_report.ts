import fs from 'fs';

const filePath = './mobile/src/screens/BusTicketing/BusDailyReportScreen.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const importTarget = `import { BarChart } from 'react-native-gifted-charts';`;
const importReplacement = `import { BarChart } from 'react-native-gifted-charts';
import DateTimePicker from '@react-native-community/datetimepicker';`;
content = content.replace(importTarget, importReplacement);

const stateTarget = `  const [selectedDate, setSelectedDate] = useState(new Date());`;
const stateReplacement = `  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);`;
content = content.replace(stateTarget, stateReplacement);

const uiTarget = `        <View style={styles.dateNav}>
          <TouchableOpacity style={styles.dateNavBtn} onPress={() => setSelectedDate((d) => addDays(d, -1))}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={C.white} />
          </TouchableOpacity>
          <Text style={styles.dateLabel}>{fmtDate(selectedDate)}</Text>
          <TouchableOpacity
            style={styles.dateNavBtn}
            onPress={() => setSelectedDate((d) => addDays(d, 1))}
            disabled={selectedDate >= new Date()}
          >
            <MaterialCommunityIcons name="chevron-right" size={24} color={selectedDate >= new Date() ? C.border : C.white} />
          </TouchableOpacity>
        </View>`;

const uiReplacement = `        <View style={styles.dateNav}>
          <TouchableOpacity style={styles.dateNavBtn} onPress={() => setSelectedDate((d) => addDays(d, -1))}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={C.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowPicker(true)} style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
            <MaterialCommunityIcons name="calendar" size={18} color={C.amber} />
            <Text style={styles.dateLabel}>{fmtDate(selectedDate)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dateNavBtn}
            onPress={() => setSelectedDate((d) => addDays(d, 1))}
            disabled={selectedDate >= new Date()}
          >
            <MaterialCommunityIcons name="chevron-right" size={24} color={selectedDate >= new Date() ? C.border : C.white} />
          </TouchableOpacity>
        </View>

        {showPicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="default"
            maximumDate={new Date()}
            onChange={(event, date) => {
              setShowPicker(false);
              if (date) setSelectedDate(date);
            }}
          />
        )}`;
content = content.replace(uiTarget, uiReplacement);

fs.writeFileSync(filePath, content);
