import fs from 'fs';

function fixDaily() {
  const file = './mobile/src/screens/BusTicketing/BusDailyReportScreen.tsx';
  let content = fs.readFileSync(file, 'utf8');
  
  // Remove duplicate showPicker
  const match = "const [selectedDate, setSelectedDate] = useState(new Date());\n  const [showPicker, setShowPicker] = useState(false);\n  const [showPicker, setShowPicker] = useState(false);";
  if (content.includes(match)) {
    content = content.replace(match, "const [selectedDate, setSelectedDate] = useState(new Date());\n  const [showPicker, setShowPicker] = useState(false);");
  } else {
    // maybe it is declared twice in a different way
    const count = (content.match(/const \[showPicker, setShowPicker\] = useState\(false\);/g) || []).length;
    if (count > 1) {
       content = content.replace("const [showPicker, setShowPicker] = useState(false);\n", "");
    }
  }
  fs.writeFileSync(file, content);
}

function fixRange() {
  const file = './mobile/src/screens/BusTicketing/BusRangeReportScreen.tsx';
  let content = fs.readFileSync(file, 'utf8');

  // Replace remaining setSelectingFrom/To
  content = content.replace(/setSelectingFrom/g, 'setShowFromPicker');
  content = content.replace(/selectingFrom/g, 'showFromPicker');
  
  content = content.replace(/setSelectingTo/g, 'setShowToPicker');
  content = content.replace(/selectingTo/g, 'showToPicker');

  fs.writeFileSync(file, content);
}

fixDaily();
fixRange();
