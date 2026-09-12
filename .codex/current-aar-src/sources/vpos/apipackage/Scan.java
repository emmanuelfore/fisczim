package vpos.apipackage;

/* JADX INFO: loaded from: classes.jar:vpos/apipackage/Scan.class */
public class Scan {
    public static native int Lib_ScanOpen();

    public static native int Lib_ScanClose();

    public static native int Lib_ScanRead(short s, String[] strArr);

    static {
        System.loadLibrary("PosApi");
    }
}
