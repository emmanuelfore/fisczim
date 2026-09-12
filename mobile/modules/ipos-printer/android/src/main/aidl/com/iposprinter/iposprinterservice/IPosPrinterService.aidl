package com.iposprinter.iposprinterservice;

import com.iposprinter.iposprinterservice.IPosPrinterCallback;
import android.graphics.Bitmap;

/**
 * Interface definition for iPOS printer service
 */
interface IPosPrinterService {
    int getPrinterStatus();
    void printerInit(IPosPrinterCallback callback);
    void setPrinterPrintDepth(int depth, IPosPrinterCallback callback);
    void setPrinterPrintFont(String fontName, IPosPrinterCallback callback);
    void setPrinterPrintFontSize(int fontSize, IPosPrinterCallback callback);
    void setPrinterPrintAlignment(int alignment, IPosPrinterCallback callback);
    void printText(String text, IPosPrinterCallback callback);
    void printSpecifiedTypeText(String text, String fontName, int fontSize, IPosPrinterCallback callback);
    void printColumnsText(in String[] textArray, in int[] widthArray, in int[] alignArray, IPosPrinterCallback callback);
    void printBitmap(int alignment, int bitmapWidth, in Bitmap bitmap, IPosPrinterCallback callback);
    void printBarCode(String data, int symbology, int height, int width, int alignment, IPosPrinterCallback callback);
    void printQRCode(String data, int moduleSize, int errorCorrectionLevel, IPosPrinterCallback callback);
    void printRawData(in byte[] data, IPosPrinterCallback callback);
    void sendRAWData(in byte[] data, IPosPrinterCallback callback);
    void printerPerformPrint(int feedLines, IPosPrinterCallback callback);
    void printLine(int lines, IPosPrinterCallback callback);
    void printCompactMode(int mode, IPosPrinterCallback callback);
    void printTable(in String[] textArray, in int[] widthArray, in int[] alignArray, IPosPrinterCallback callback);
}
