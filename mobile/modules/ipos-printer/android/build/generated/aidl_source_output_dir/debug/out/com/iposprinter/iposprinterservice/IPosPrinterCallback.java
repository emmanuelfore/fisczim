/*
 * This file is auto-generated.  DO NOT MODIFY.
 * Using: /home/emmanuel/Android/Sdk/build-tools/35.0.0/aidl -p/home/emmanuel/Android/Sdk/platforms/android-34/framework.aidl -o/home/emmanuel/Documents/PROJECTS/fisczim/mobile/modules/ipos-printer/android/build/generated/aidl_source_output_dir/debug/out -I/home/emmanuel/Documents/PROJECTS/fisczim/mobile/modules/ipos-printer/android/src/main/aidl -I/home/emmanuel/Documents/PROJECTS/fisczim/mobile/modules/ipos-printer/android/src/debug/aidl -I/home/emmanuel/.gradle/caches/8.14.3/transforms/774dbece3e6026f30ce4f1511c308483/transformed/core-1.13.1/aidl -I/home/emmanuel/.gradle/caches/8.14.3/transforms/43de6a25f0450dc5b622ee2e2f4c5e07/transformed/versionedparcelable-1.1.1/aidl -d/tmp/aidl5205982681970556028.d /home/emmanuel/Documents/PROJECTS/fisczim/mobile/modules/ipos-printer/android/src/main/aidl/com/iposprinter/iposprinterservice/IPosPrinterCallback.aidl
 */
package com.iposprinter.iposprinterservice;
/** Callback interface for execution results of iPOS print service */
public interface IPosPrinterCallback extends android.os.IInterface
{
  /** Default implementation for IPosPrinterCallback. */
  public static class Default implements com.iposprinter.iposprinterservice.IPosPrinterCallback
  {
    @Override public void onRunResult(boolean isSuccess) throws android.os.RemoteException
    {
    }
    @Override public void onReturnString(java.lang.String result) throws android.os.RemoteException
    {
    }
    @Override
    public android.os.IBinder asBinder() {
      return null;
    }
  }
  /** Local-side IPC implementation stub class. */
  public static abstract class Stub extends android.os.Binder implements com.iposprinter.iposprinterservice.IPosPrinterCallback
  {
    /** Construct the stub at attach it to the interface. */
    @SuppressWarnings("this-escape")
    public Stub()
    {
      this.attachInterface(this, DESCRIPTOR);
    }
    /**
     * Cast an IBinder object into an com.iposprinter.iposprinterservice.IPosPrinterCallback interface,
     * generating a proxy if needed.
     */
    public static com.iposprinter.iposprinterservice.IPosPrinterCallback asInterface(android.os.IBinder obj)
    {
      if ((obj==null)) {
        return null;
      }
      android.os.IInterface iin = obj.queryLocalInterface(DESCRIPTOR);
      if (((iin!=null)&&(iin instanceof com.iposprinter.iposprinterservice.IPosPrinterCallback))) {
        return ((com.iposprinter.iposprinterservice.IPosPrinterCallback)iin);
      }
      return new com.iposprinter.iposprinterservice.IPosPrinterCallback.Stub.Proxy(obj);
    }
    @Override public android.os.IBinder asBinder()
    {
      return this;
    }
    @Override public boolean onTransact(int code, android.os.Parcel data, android.os.Parcel reply, int flags) throws android.os.RemoteException
    {
      java.lang.String descriptor = DESCRIPTOR;
      if (code >= android.os.IBinder.FIRST_CALL_TRANSACTION && code <= android.os.IBinder.LAST_CALL_TRANSACTION) {
        data.enforceInterface(descriptor);
      }
      if (code == INTERFACE_TRANSACTION) {
        reply.writeString(descriptor);
        return true;
      }
      switch (code)
      {
        case TRANSACTION_onRunResult:
        {
          boolean _arg0;
          _arg0 = (0!=data.readInt());
          this.onRunResult(_arg0);
          break;
        }
        case TRANSACTION_onReturnString:
        {
          java.lang.String _arg0;
          _arg0 = data.readString();
          this.onReturnString(_arg0);
          break;
        }
        default:
        {
          return super.onTransact(code, data, reply, flags);
        }
      }
      return true;
    }
    private static class Proxy implements com.iposprinter.iposprinterservice.IPosPrinterCallback
    {
      private android.os.IBinder mRemote;
      Proxy(android.os.IBinder remote)
      {
        mRemote = remote;
      }
      @Override public android.os.IBinder asBinder()
      {
        return mRemote;
      }
      public java.lang.String getInterfaceDescriptor()
      {
        return DESCRIPTOR;
      }
      @Override public void onRunResult(boolean isSuccess) throws android.os.RemoteException
      {
        android.os.Parcel _data = android.os.Parcel.obtain();
        try {
          _data.writeInterfaceToken(DESCRIPTOR);
          _data.writeInt(((isSuccess)?(1):(0)));
          boolean _status = mRemote.transact(Stub.TRANSACTION_onRunResult, _data, null, android.os.IBinder.FLAG_ONEWAY);
        }
        finally {
          _data.recycle();
        }
      }
      @Override public void onReturnString(java.lang.String result) throws android.os.RemoteException
      {
        android.os.Parcel _data = android.os.Parcel.obtain();
        try {
          _data.writeInterfaceToken(DESCRIPTOR);
          _data.writeString(result);
          boolean _status = mRemote.transact(Stub.TRANSACTION_onReturnString, _data, null, android.os.IBinder.FLAG_ONEWAY);
        }
        finally {
          _data.recycle();
        }
      }
    }
    static final int TRANSACTION_onRunResult = (android.os.IBinder.FIRST_CALL_TRANSACTION + 0);
    static final int TRANSACTION_onReturnString = (android.os.IBinder.FIRST_CALL_TRANSACTION + 1);
  }
  /** @hide */
  public static final java.lang.String DESCRIPTOR = "com.iposprinter.iposprinterservice.IPosPrinterCallback";
  public void onRunResult(boolean isSuccess) throws android.os.RemoteException;
  public void onReturnString(java.lang.String result) throws android.os.RemoteException;
}
