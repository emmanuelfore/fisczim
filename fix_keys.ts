import fs from 'fs';

function fixFile(file: string) {
  let content = fs.readFileSync(file, 'utf8');

  // Fix byRoute
  content = content.replace(
    /\{summary\.byRoute\.map\(\(rb\) => \(\n\s*<View key=\{rb\.routeId\}/g,
    "{summary.byRoute.map((rb, index) => (\n              <View key={rb.routeId || `route-${index}`} "
  );
  content = content.replace(
    /\{report\.byRoute\.map\(\(rb\) => \(\n\s*<View key=\{rb\.routeId\}/g,
    "{report.byRoute.map((rb, index) => (\n              <View key={rb.routeId || `route-${index}`}"
  );

  // Fix byStop
  content = content.replace(
    /\{summary\.byStop\.slice\(0, 20\)\.map\(\(sb\) => \(\n\s*<View key=\{sb\.id\}/g,
    "{summary.byStop.slice(0, 20).map((sb, index) => (\n              <View key={sb.id || `stop-${index}`}"
  );
  content = content.replace(
    /\{report\.byStop\.slice\(0, 20\)\.map\(\(sb\) => \(\n\s*<View key=\{sb\.id\}/g,
    "{report.byStop.slice(0, 20).map((sb, index) => (\n              <View key={sb.id || `stop-${index}`}"
  );

  // Fix byPaymentMethod
  content = content.replace(
    /\{summary\.byPaymentMethod\.map\(\(pb\) => \(\n\s*<View key=\{pb\.method\}/g,
    "{summary.byPaymentMethod.map((pb, index) => (\n                <View key={pb.method || `pay-${index}`}"
  );
  content = content.replace(
    /\{report\.byPaymentMethod\.map\(\(pb\) => \(\n\s*<View key=\{pb\.method\}/g,
    "{report.byPaymentMethod.map((pb, index) => (\n                <View key={pb.method || `pay-${index}`}"
  );

  // Fix visibleConductors
  content = content.replace(
    /\{visibleConductors\.map\(\(c, i\) => \(\n\s*<TouchableOpacity\n\s*key=\{c\.id\}/g,
    "{visibleConductors.map((c, i) => (\n            <TouchableOpacity\n              key={c.id || `cond-${i}`}"
  );

  fs.writeFileSync(file, content);
}

fixFile('./mobile/src/screens/BusTicketing/BusDailyReportScreen.tsx');
fixFile('./mobile/src/screens/BusTicketing/BusRangeReportScreen.tsx');
fixFile('./mobile/src/screens/BusTicketing/BusConductorReportScreen.tsx');
