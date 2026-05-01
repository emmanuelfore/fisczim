import Z100PrinterModule from './src/Z100PrinterModule';

export async function printInit(): Promise<boolean> {
  return await Z100PrinterModule.printInit();
}

export async function printString(text: string, size?: number, align?: number): Promise<boolean> {
  return await Z100PrinterModule.printString(text, size ?? 24, align ?? 0);
}

export async function printStart(): Promise<boolean> {
  return await Z100PrinterModule.printStart();
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
  printStart,
  printClose,
  printSetVoltage,
  printSetGray,
  checkStatus,
};
