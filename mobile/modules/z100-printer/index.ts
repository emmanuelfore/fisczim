import Z100PrinterModule from './src/Z100PrinterModule';

export async function printInit(): Promise<boolean> {
  return await Z100PrinterModule.printInit();
}

export async function getLogs(): Promise<string[]> {
  return await Z100PrinterModule.getLogs();
}

export async function clearLogs(): Promise<boolean> {
  return await Z100PrinterModule.clearLogs();
}

export async function saveLogsToDevice(): Promise<string> {
  return await Z100PrinterModule.saveLogsToDevice();
}

export async function diagnoseUart(): Promise<string[]> {
  return await Z100PrinterModule.diagnoseUart();
}

export async function getDiagnostics(): Promise<string[]> {
  return await Z100PrinterModule.getDiagnostics();
}

export async function isZ100Device(): Promise<boolean> {
  return await Z100PrinterModule.isZ100Device();
}

export async function recordLog(message: string): Promise<boolean> {
  return await Z100PrinterModule.recordLog(message);
}

export async function printQrCode(content: string, width: number, height: number): Promise<boolean> {
  return await Z100PrinterModule.printQrCode(content, width, height);
}

export async function printString(text: string, size?: number, align?: number, zoom?: number): Promise<boolean> {
  return await Z100PrinterModule.printString(text, size, align, zoom);
}

export async function printStart(): Promise<boolean> {
  return await Z100PrinterModule.printStart();
}

export async function printSdkSample(): Promise<boolean> {
  return await Z100PrinterModule.printSdkSample();
}

export async function printClose(): Promise<boolean> {
  return await Z100PrinterModule.printClose();
}

export async function printSetVoltage(voltage: number): Promise<boolean> {
  return await Z100PrinterModule.printSetVoltage(voltage);
}

export async function printSetGray(gray: number): Promise<boolean> {
  return await Z100PrinterModule.printSetGray(gray);
}

export async function checkStatus(): Promise<number> {
  return await Z100PrinterModule.checkStatus();
}

export default {
  printInit,
  printString,
  printQrCode,
  printStart,
  printSdkSample,
  printClose,
  printSetVoltage,
  printSetGray,
  checkStatus,
  saveLogsToDevice,
  diagnoseUart,
  getDiagnostics,
  isZ100Device,
  recordLog,
};
