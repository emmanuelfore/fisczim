import fs from 'fs';

function patchDaily() {
  const file = './mobile/src/screens/BusTicketing/BusDailyReportScreen.tsx';
  let content = fs.readFileSync(file, 'utf8');

  if (!content.includes("@react-native-community/datetimepicker")) {
    content = content.replace(
      "import { MaterialCommunityIcons } from '@expo/vector-icons';",
      "import { MaterialCommunityIcons } from '@expo/vector-icons';\nimport DateTimePicker from '@react-native-community/datetimepicker';"
    );
  }

  content = content.replace(
    "const [selectedDate, setSelectedDate] = useState(new Date());",
    "const [selectedDate, setSelectedDate] = useState(new Date());\n  const [showPicker, setShowPicker] = useState(false);"
  );

  content = content.replace(
    "<Text style={styles.dateLabel}>{fmtDate(selectedDate)}</Text>",
    "<TouchableOpacity onPress={() => setShowPicker(true)}>\n            <Text style={styles.dateLabel}>{fmtDate(selectedDate)}</Text>\n          </TouchableOpacity>\n          {showPicker && (\n            <DateTimePicker\n              value={selectedDate}\n              mode=\"date\"\n              display=\"default\"\n              onChange={(event, date) => {\n                setShowPicker(false);\n                if (date) setSelectedDate(date);\n              }}\n            />\n          )}"
  );

  fs.writeFileSync(file, content);
}

function patchRange() {
  const file = './mobile/src/screens/BusTicketing/BusRangeReportScreen.tsx';
  let content = fs.readFileSync(file, 'utf8');

  if (!content.includes("@react-native-community/datetimepicker")) {
    content = content.replace(
      "import { MaterialCommunityIcons } from '@expo/vector-icons';",
      "import { MaterialCommunityIcons } from '@expo/vector-icons';\nimport DateTimePicker from '@react-native-community/datetimepicker';"
    );
  }

  content = content.replace(
    "const [toDate, setToDate] = useState(today);\n  const [selectingFrom, setSelectingFrom] = useState(false);",
    "const [toDate, setToDate] = useState(today);\n  const [showFromPicker, setShowFromPicker] = useState(false);\n  const [showToPicker, setShowToPicker] = useState(false);"
  );

  content = content.replace(
    "<Text style={styles.datePickerValue}>{fmtDate(fromDate)}</Text>",
    "<TouchableOpacity onPress={() => setShowFromPicker(true)}>\n                <Text style={styles.datePickerValue}>{fmtDate(fromDate)}</Text>\n              </TouchableOpacity>\n              {showFromPicker && (\n                <DateTimePicker\n                  value={fromDate}\n                  mode=\"date\"\n                  display=\"default\"\n                  onChange={(event, date) => {\n                    setShowFromPicker(false);\n                    if (date) {\n                      setFromDate(date);\n                      if (date > toDate) setToDate(date);\n                    }\n                  }}\n                />\n              )}"
  );

  content = content.replace(
    "<Text style={styles.datePickerValue}>{fmtDate(toDate)}</Text>",
    "<TouchableOpacity onPress={() => setShowToPicker(true)}>\n                <Text style={styles.datePickerValue}>{fmtDate(toDate)}</Text>\n              </TouchableOpacity>\n              {showToPicker && (\n                <DateTimePicker\n                  value={toDate}\n                  mode=\"date\"\n                  display=\"default\"\n                  onChange={(event, date) => {\n                    setShowToPicker(false);\n                    if (date) {\n                      setToDate(date);\n                      if (date < fromDate) setFromDate(date);\n                    }\n                  }}\n                />\n              )}"
  );

  fs.writeFileSync(file, content);
}

function patchConductor() {
  const file = './mobile/src/screens/BusTicketing/BusConductorReportScreen.tsx';
  let content = fs.readFileSync(file, 'utf8');

  if (!content.includes("@react-native-community/datetimepicker")) {
    content = content.replace(
      "import { MaterialCommunityIcons } from '@expo/vector-icons';",
      "import { MaterialCommunityIcons } from '@expo/vector-icons';\nimport DateTimePicker from '@react-native-community/datetimepicker';"
    );
  }

  content = content.replace(
    "const [selectedDate, setSelectedDate] = useState(today);",
    "const [selectedDate, setSelectedDate] = useState(today);\n  const [showPicker, setShowPicker] = useState(false);"
  );

  content = content.replace(
    "<Text style={styles.dateLabel}>{fmtDate(selectedDate)}</Text>",
    "<TouchableOpacity onPress={() => setShowPicker(true)}>\n            <Text style={styles.dateLabel}>{fmtDate(selectedDate)}</Text>\n          </TouchableOpacity>\n          {showPicker && (\n            <DateTimePicker\n              value={selectedDate}\n              mode=\"date\"\n              display=\"default\"\n              onChange={(event, date) => {\n                setShowPicker(false);\n                if (date) setSelectedDate(date);\n              }}\n            />\n          )}"
  );

  fs.writeFileSync(file, content);
}

patchDaily();
patchRange();
patchConductor();
