package vpos.apipackage;

import android.graphics.Bitmap;
import android.util.Log;
import com.google.zxing.BarcodeFormat;
import java.io.UnsupportedEncodingException;

/* JADX INFO: loaded from: classes.jar:vpos/apipackage/Print.class */
public class Print {
    private final String tag = "Print";

    public static native int Lib_PrnInit();

    public static native int Lib_PrnSetSpace(byte b, byte b2);

    public static native int Lib_PrnSetFont(byte b, byte b2, byte b3);

    public static native int Lib_PrnGetFont(byte[] bArr, byte[] bArr2, byte[] bArr3);

    public static native int Lib_PrnStep(int i);

    public static native int Lib_PrnSetVoltage(int i);

    public static native int Lib_PrnIsCharge(int i);

    public static native int Lib_PrnStr(byte[] bArr);

    public static native int Lib_PrnBlock(byte[] bArr);

    public static native int Lib_PrnCutPicture(byte[] bArr);

    public static native int Lib_PrnCutPictureStr(byte[] bArr, byte[] bArr2, int i);

    public static native int Lib_PrnLogo(byte[] bArr);

    public static native int Lib_SetLinPixelDis(char c);

    public static native int Lib_PrnStart();

    public static native int Lib_PrnConventional(int i);

    public static native int Lib_PrnContinuous(int i);

    public static native int Lib_PrnClose();

    public static native int Lib_CTNPrnStart();

    public static native int Lib_PrnSetLeftIndent(int i);

    public static native int Lib_PrnSetAlign(int i);

    public static native int Lib_PrnSetCharSpace(int i);

    public static native int Lib_PrnSetLineSpace(int i);

    public static native int Lib_PrnSetLeftSpace(int i);

    public static native int Lib_PrnSetGray(int i);

    public static native int Lib_PrnSetSpeed(int i);

    public static native int Lib_PrnCheckStatus();

    public static native int Lib_PrnFeedPaper(int i);

    public static native int Lib_K21PrnStart256(int i, int i2);

    public static native int Lib_K21PrnData(byte b, byte[] bArr, int i);

    public static native int Lib_K21PrnData256(byte[] bArr, int i);

    public static native int Lib_K21PrnStartPrint(byte b);

    public static native int Lib_K21PrnEnd(byte b);

    public static native int Lib_K21PrnCTN(int i);

    public static native int Lib_K21PrnCheck();

    public static native int Lib_PrnSetEnvironment(int i, int i2, int i3, int i4);

    public static native int Lib_PrnSetCom460800();

    static {
        System.loadLibrary("PosApi");
    }

    public static int Lib_PrnStr(String str) {
        byte[] strbytes = null;
        try {
            System.out.println("original string---" + str);
            strbytes = str.getBytes("UnicodeBigUnmarked");
        } catch (UnsupportedEncodingException e) {
            e.printStackTrace();
        }
        Lib_PrnStr(strbytes);
        return 0;
    }

    public int Lib_PrnBarcode(String contents, int desiredWidth, int desiredHeight, BarcodeFormat barcodeFormat) {
        Bitmap bitmap = BarcodeCreater.creatBarcode(contents, desiredWidth, desiredHeight, barcodeFormat);
        int iret = Lib_PrnBmp(bitmap);
        if (iret != 0) {
            Log.e("VPOS", "Lib_PrnSendBmp fail, iret = " + iret);
            return iret;
        }
        return iret;
    }

    public int printCutQrCode(String contents, int desiredWidth, int desiredHeight, BarcodeFormat barcodeFormat) {
        Bitmap bitmap = BarcodeCreater.creatBarcode(contents, desiredWidth, desiredHeight, barcodeFormat);
        int iret = prnCutQrCode(bitmap);
        if (iret != 0) {
            Log.e("VPOS", "Lib_PrnSendBmp fail, iret = " + iret);
            return iret;
        }
        return iret;
    }

    public int printCutQrCodeStr(String srcContent, String qrStr, int distance, int desiredWidth, int desiredHeight, BarcodeFormat barcodeFormat) {
        Bitmap bitmap = BarcodeCreater.creatBarcode(srcContent, desiredWidth, desiredHeight, barcodeFormat);
        int iret = prnCutQrCodeStr(bitmap, qrStr, distance);
        if (iret != 0) {
            Log.e("VPOS", "Lib_PrnSendBmp fail, iret = " + iret);
            return iret;
        }
        return iret;
    }

    public int Lib_PrnBmp(Bitmap bitmap) {
        PrinterBitmap pPrinterBmpLine = Bitmap2PrintDot(bitmap);
        int iBufferSize = pPrinterBmpLine.m_iRowBytes * pPrinterBmpLine.m_iHeight;
        byte[] byLogoBuffer = new byte[5 + iBufferSize];
        System.arraycopy(pPrinterBmpLine.m_pDotByteBuffer, 0, byLogoBuffer, 5, iBufferSize);
        byLogoBuffer[0] = (byte) (pPrinterBmpLine.m_iWidth / 256);
        byLogoBuffer[1] = (byte) (pPrinterBmpLine.m_iWidth % 256);
        byLogoBuffer[2] = (byte) (pPrinterBmpLine.m_iHeight / 256);
        byLogoBuffer[3] = (byte) (pPrinterBmpLine.m_iHeight % 256);
        int iRetCode = Lib_PrnLogo(byLogoBuffer);
        if (iRetCode != 0) {
            return iRetCode;
        }
        return iRetCode;
    }

    public int prnCutQrCode(Bitmap bitmap) {
        PrinterBitmap pPrinterBmpLine = Bitmap2PrintDot(bitmap);
        int iBufferSize = pPrinterBmpLine.m_iRowBytes * pPrinterBmpLine.m_iHeight;
        byte[] byLogoBuffer = new byte[5 + iBufferSize];
        System.arraycopy(pPrinterBmpLine.m_pDotByteBuffer, 0, byLogoBuffer, 5, iBufferSize);
        byLogoBuffer[0] = (byte) (pPrinterBmpLine.m_iWidth / 256);
        byLogoBuffer[1] = (byte) (pPrinterBmpLine.m_iWidth % 256);
        byLogoBuffer[2] = (byte) (pPrinterBmpLine.m_iHeight / 256);
        byLogoBuffer[3] = (byte) (pPrinterBmpLine.m_iHeight % 256);
        int iRetCode = Lib_PrnCutPicture(byLogoBuffer);
        if (iRetCode != 0) {
            return iRetCode;
        }
        return iRetCode;
    }

    public int prnCutQrCodeStr(Bitmap bitmap, String txt, int distance) {
        PrinterBitmap pPrinterBmpLine = Bitmap2PrintDot(bitmap);
        int iBufferSize = pPrinterBmpLine.m_iRowBytes * pPrinterBmpLine.m_iHeight;
        byte[] byLogoBuffer = new byte[5 + iBufferSize];
        System.arraycopy(pPrinterBmpLine.m_pDotByteBuffer, 0, byLogoBuffer, 5, iBufferSize);
        byLogoBuffer[0] = (byte) (pPrinterBmpLine.m_iWidth / 256);
        byLogoBuffer[1] = (byte) (pPrinterBmpLine.m_iWidth % 256);
        byLogoBuffer[2] = (byte) (pPrinterBmpLine.m_iHeight / 256);
        byLogoBuffer[3] = (byte) (pPrinterBmpLine.m_iHeight % 256);
        byte[] strbytes = null;
        try {
            System.out.println("original string---" + txt);
            strbytes = txt.getBytes("UnicodeBigUnmarked");
        } catch (UnsupportedEncodingException e) {
            e.printStackTrace();
        }
        System.out.println("original string---strbytes.length" + strbytes.length);
        int iRetCode = Lib_PrnCutPictureStr(byLogoBuffer, strbytes, distance);
        if (iRetCode != 0) {
            return iRetCode;
        }
        return iRetCode;
    }

    private PrinterBitmap Bitmap2PrintDot(Bitmap m_pBitmap) {
        int x;
        int iW = m_pBitmap.getWidth();
        int iH = m_pBitmap.getHeight();
        Log.i("iW = ", Integer.toString(iW));
        Log.i("iH = ", Integer.toString(iH));
        int iRowBytes = (iW + 7) / 8;
        Log.i("iRowBytes = ", Integer.toString(iRowBytes));
        int iBufferSize = iRowBytes * iH;
        Log.i("iBufferSize = ", Integer.toString(iBufferSize));
        byte[] byBuffer = new byte[iBufferSize];
        for (int iBufferPos = 0; iBufferPos < iBufferSize; iBufferPos++) {
            byBuffer[iBufferPos] = 0;
        }
        for (int y = 0; y < iH; y++) {
            for (int iRowByteIndex = 0; iRowByteIndex < iRowBytes; iRowByteIndex++) {
                for (int iBitIndex = 0; iBitIndex < 8 && iW > (x = (iRowByteIndex * 8) + iBitIndex); iBitIndex++) {
                    int iValue = m_pBitmap.getPixel(x, y);
                    if (-16777216 == iValue) {
                        byBuffer[(y * iRowBytes) + iRowByteIndex] = (byte) (((double) byBuffer[r1]) + Math.pow(2.0d, 7 - iBitIndex));
                    }
                }
            }
        }
        PrinterBitmap bmp = new PrinterBitmap();
        bmp.m_pDotByteBuffer = byBuffer;
        bmp.m_iRowBytes = iRowBytes;
        bmp.m_iWidth = m_pBitmap.getWidth();
        bmp.m_iHeight = m_pBitmap.getHeight();
        return bmp;
    }

    /* JADX INFO: loaded from: classes.jar:vpos/apipackage/Print$PrinterBitmap.class */
    private class PrinterBitmap {
        public byte[] m_pDotByteBuffer;
        public int m_iRowBytes;
        public int m_iWidth;
        public int m_iHeight;

        public PrinterBitmap() {
            this.m_pDotByteBuffer = null;
            this.m_iRowBytes = 0;
            this.m_iWidth = 0;
            this.m_iHeight = 0;
            this.m_pDotByteBuffer = null;
            this.m_iRowBytes = 0;
            this.m_iWidth = 0;
            this.m_iHeight = 0;
        }
    }
}
