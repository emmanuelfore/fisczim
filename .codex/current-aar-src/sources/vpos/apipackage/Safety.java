package vpos.apipackage;

/* JADX INFO: loaded from: classes.jar:vpos/apipackage/Safety.class */
public class Safety {
    public static native int Lib_SetTamperBit(byte b, byte b2);

    public static native int Lib_ReadTamperBit(byte[] bArr);

    static {
        System.loadLibrary("PosApi");
    }
}
