import 'package:cs10_z100_pos_printer/printer_codes.dart';

import 'cs10_z100_pos_printer_platform_interface.dart';

export 'printer_codes.dart';

/// A Flutter plugin for printing on the integrated terminal of CS10-Z100 POS devices.
class Cs10Z100PosPrinter {
  /// Initializes the printer.
  ///
  /// The [initParams] parameter is optional and can be used to provide
  /// specific initialization settings.
  ///
  /// Returns `true` if the initialization was successful, `false` otherwise.
  Future<bool> printInit() => Cs10Z100PosPrinterPlatform.instance.printInit();

  /// Adds a [PrinterText] object to the print queue.
  ///
  /// This method is used to print text with specific formatting options
  /// defined in the [PrinterText] object.
  ///
  /// Returns `true` if adding the text to the queue was successful,
  /// `false` otherwise.
  Future<bool> addString(PrinterText printerText) =>
      Cs10Z100PosPrinterPlatform.instance.printString(printerText);

  /// Start printing process
  Future<bool> printStart() => Cs10Z100PosPrinterPlatform.instance.printStart();

  /// Close printing and clear queue
  Future<bool> printClose() => Cs10Z100PosPrinterPlatform.instance.printClose();

  /// Check printer status
  Future<PrinterStatus> printCheckStatus() =>
      Cs10Z100PosPrinterPlatform.instance.printCheckStatus();

  /// Adds a [PrinterQrCode] object to the print queue.
  ///
  /// This method is used to print a QR code with the specified data
  /// and dimensions defined in the [PrinterQrCode] object.
  ///
  /// Returns `true` if adding the QR code to the queue was successful,
  /// `false` otherwise.
  Future<bool> addQrCode(PrinterQrCode qrCode) =>
      Cs10Z100PosPrinterPlatform.instance.printQrCode(qrCode);

  /// Adds a [Printable] object to the print queue.
  ///
  /// This method handles adding different types of printable objects
  /// (e.g., [PrinterText], [PrinterQrCode]) to the queue.
  /// It determines the specific printing method to call based on the
  /// runtime type of the [obj] parameter.
  ///
  /// Throws an [UnimplementedError] if an unsupported [Printable] type is provided.
  Future<bool> addToQueue(Printable obj) async {
    final type = obj.runtimeType;
    if (type == PrinterText) {
      return addString(obj as PrinterText);
    }
    if (type == PrinterQrCode) {
      return addQrCode(obj as PrinterQrCode);
    }
    throw UnimplementedError();
  }
}
