import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './Z100Printer.types';

type Z100PrinterModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class Z100PrinterModule extends NativeModule<Z100PrinterModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(Z100PrinterModule, 'Z100PrinterModule');
