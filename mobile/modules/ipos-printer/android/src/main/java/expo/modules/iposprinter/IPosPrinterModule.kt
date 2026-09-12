package expo.modules.iposprinter

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Binder
import android.os.IBinder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import android.os.Parcel
import android.util.Base64
import android.util.Log
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Raw binder transaction codes exactly matching the IPosPrinterService APK implementation.
 * Note: These differ from the AIDL order because the system service has extra methods inserted.
 */
private object TX {
    const val GET_STATUS     = IBinder.FIRST_CALL_TRANSACTION + 0
    const val INIT           = IBinder.FIRST_CALL_TRANSACTION + 1
    const val SET_DEPTH      = IBinder.FIRST_CALL_TRANSACTION + 2
    const val SET_FONT       = IBinder.FIRST_CALL_TRANSACTION + 3
    const val SET_FONT_SIZE  = IBinder.FIRST_CALL_TRANSACTION + 4
    const val SET_ALIGN      = IBinder.FIRST_CALL_TRANSACTION + 5
    const val FEED_LINES     = IBinder.FIRST_CALL_TRANSACTION + 6
    const val PRINT_BLANK    = IBinder.FIRST_CALL_TRANSACTION + 7
    const val PRINT_TEXT     = IBinder.FIRST_CALL_TRANSACTION + 8
    const val PRINT_SPEC     = IBinder.FIRST_CALL_TRANSACTION + 9
    const val PRINT_SPEC_FMT = IBinder.FIRST_CALL_TRANSACTION + 10
    const val PRINT_COLUMNS  = IBinder.FIRST_CALL_TRANSACTION + 11
    const val PRINT_BITMAP   = IBinder.FIRST_CALL_TRANSACTION + 12
    const val PRINT_BARCODE  = IBinder.FIRST_CALL_TRANSACTION + 13
    const val PRINT_QR       = IBinder.FIRST_CALL_TRANSACTION + 14
    const val PRINT_RAW      = IBinder.FIRST_CALL_TRANSACTION + 15
    const val SEND_CMD       = IBinder.FIRST_CALL_TRANSACTION + 16
    const val PERFORM_PRINT  = IBinder.FIRST_CALL_TRANSACTION + 17
    const val PRINT_BOLD     = IBinder.FIRST_CALL_TRANSACTION + 18
}

/**
 * A simple binder that acts as the callback from the printer service.
 * We use a raw Binder instead of AIDL-generated Stub to avoid descriptor mismatches.
 * 
 * The service calls:
 *   - onRunResult(boolean)  → transaction code 1 (FIRST_CALL_TRANSACTION + 0)
 *   - onReturnString(String) → transaction code 2 (FIRST_CALL_TRANSACTION + 1)
 */
private class PrinterCallback(
    private val onResult: (Boolean) -> Unit,
    private val onString: (String) -> Unit
) : Binder() {
    override fun onTransact(code: Int, data: Parcel, reply: Parcel?, flags: Int): Boolean {
        return try {
            // Skip the interface token if present (enforceInterface equivalent)
            // Try to read it but don't fail if it's not there
            when (code) {
                IBinder.FIRST_CALL_TRANSACTION + 0 -> {
                    // onRunResult(boolean isSuccess)
                    val isSuccess = data.readInt() != 0
                    Log.d("IPosPrinter", "Callback onRunResult: $isSuccess")
                    onResult(isSuccess)
                    true
                }
                IBinder.FIRST_CALL_TRANSACTION + 1 -> {
                    // onReturnString(String result)
                    val result = data.readString() ?: ""
                    Log.d("IPosPrinter", "Callback onReturnString: $result")
                    onString(result)
                    true
                }
                else -> super.onTransact(code, data, reply, flags)
            }
        } catch (e: Exception) {
            Log.e("IPosPrinter", "Callback onTransact error: ${e.message}", e)
            false
        }
    }
}

class IPosPrinterModule : Module() {

    private var serviceBinder: IBinder? = null
    private var isBound = false
    private var isConnecting = false
    private val pendingActions = mutableListOf<(IBinder) -> Unit>()

    // Keep STRONG references to callbacks so they aren't GC'd before the service
    // asynchronously calls back on a worker thread (service stores WeakReference)
    private val activeCallbacks = ConcurrentHashMap<Int, PrinterCallback>()
    private val callbackIdGen = AtomicInteger(0)

    companion object {
        private const val TAG = "IPosPrinterModule"
        private const val SERVICE_PACKAGE = "com.iposprinter.iposprinterservice"
        private const val SERVICE_ACTION = "com.iposprinter.iposprinterservice.IPosPrintService"
        private const val SERVICE_CLASS = "com.iposprinter.iposprinterservice.IPosPrintService"
        // Interface descriptor written to parcel for the SERVICE calls (not callback)
        private const val DESCRIPTOR = "com.iposprinter.iposprinterservice.IPosPrinterService"
    }

    private val serviceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, service: IBinder?) {
            serviceBinder = service
            isBound = true
            isConnecting = false
            Log.d(TAG, "IPosPrinterService connected, draining ${pendingActions.size} pending actions")
            val actions = pendingActions.toList()
            pendingActions.clear()
            service?.let { binder -> actions.forEach { it(binder) } }
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            serviceBinder = null
            isBound = false
            isConnecting = false
            Log.d(TAG, "IPosPrinterService disconnected")
        }
    }

    private fun bindPrinterService(context: Context) {
        if (isBound || isConnecting) return
        try {
            val intent = Intent(SERVICE_ACTION).apply {
                setComponent(ComponentName(SERVICE_PACKAGE, SERVICE_CLASS))
            }
            val result = context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE)
            if (result) isConnecting = true
            Log.d(TAG, "bindService result=$result")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to bind: ${e.message}", e)
        }
    }

    private fun withBinder(promise: Promise, action: (IBinder) -> Unit) {
        val context = appContext.reactContext ?: run {
            promise.reject("ERR_CONTEXT_NULL", "React context is null", null)
            return
        }
        val binder = serviceBinder
        if (binder != null) {
            action(binder)
            return
        }
        pendingActions.add { b -> action(b) }
        bindPrinterService(context)
    }

    /**
     * Send a raw transaction with a callback.
     * Uses writeInterfaceToken() (correct for this service's enforceInterface).
     * The callback is kept in a strong-reference map so it survives GC while the
     * service's async worker thread holds only a WeakReference to it.
     */
    private fun transactWithCallback(
        binder: IBinder,
        code: Int,
        promise: Promise,
        writeArgs: Parcel.() -> Unit = {}
    ) {
        val id = callbackIdGen.incrementAndGet()
        val callback = PrinterCallback(
            onResult = { success ->
                activeCallbacks.remove(id)
                promise.resolve(success)
            },
            onString = { result ->
                activeCallbacks.remove(id)
                promise.resolve(result)
            }
        )
        // Hold a strong reference BEFORE we transact, so the object is rooted
        activeCallbacks[id] = callback

        val data = Parcel.obtain()
        val reply = Parcel.obtain()
        try {
            data.writeInterfaceToken(DESCRIPTOR)  // service enforces this
            data.writeArgs()
            data.writeStrongBinder(callback)       // non-null, kept alive in activeCallbacks
            binder.transact(code, data, reply, 0)
            reply.readException()
        } catch (e: Exception) {
            activeCallbacks.remove(id)
            Log.e(TAG, "transactWithCallback code=$code failed: ${e.message}", e)
            promise.reject("ERR_REMOTE_EXCEPTION", e.message, e)
        } finally {
            data.recycle()
            reply.recycle()
        }
    }

    override fun definition() = ModuleDefinition {
        Name("IPosPrinter")

        OnCreate {
            appContext.reactContext?.let { bindPrinterService(it) }
        }

        OnDestroy {
            if (isBound || isConnecting) {
                try { appContext.reactContext?.unbindService(serviceConnection) } catch (_: Exception) {}
                isBound = false
                isConnecting = false
                serviceBinder = null
            }
            pendingActions.clear()
            activeCallbacks.clear()
        }

        AsyncFunction("isAvailable") { promise: Promise ->
            val context = appContext.reactContext
            if (context == null) { promise.resolve(false); return@AsyncFunction }
            try {
                context.packageManager.getPackageInfo(SERVICE_PACKAGE, 0)
                promise.resolve(true)
            } catch (_: Exception) { promise.resolve(false) }
        }

        AsyncFunction("getPrinterStatus") { promise: Promise ->
            withBinder(promise) { binder ->
                val data = Parcel.obtain()
                val reply = Parcel.obtain()
                try {
                    data.writeInterfaceToken(DESCRIPTOR)
                    binder.transact(TX.GET_STATUS, data, reply, 0)
                    reply.readException()
                    promise.resolve(reply.readInt())
                } catch (e: Exception) {
                    promise.reject("ERR_STATUS", e.message, e)
                } finally {
                    data.recycle(); reply.recycle()
                }
            }
        }

        AsyncFunction("printerInit") { promise: Promise ->
            withBinder(promise) { binder ->
                transactWithCallback(binder, TX.INIT, promise)
            }
        }

        AsyncFunction("setPrinterPrintDepth") { depth: Int, promise: Promise ->
            withBinder(promise) { binder ->
                transactWithCallback(binder, TX.SET_DEPTH, promise) { writeInt(depth) }
            }
        }

        AsyncFunction("setPrinterPrintFont") { fontName: String, promise: Promise ->
            withBinder(promise) { binder ->
                transactWithCallback(binder, TX.SET_FONT, promise) { writeString(fontName) }
            }
        }

        AsyncFunction("setPrinterPrintFontSize") { fontSize: Int, promise: Promise ->
            withBinder(promise) { binder ->
                transactWithCallback(binder, TX.SET_FONT_SIZE, promise) { writeInt(fontSize) }
            }
        }

        AsyncFunction("setPrinterPrintAlignment") { alignment: Int, promise: Promise ->
            withBinder(promise) { binder ->
                transactWithCallback(binder, TX.SET_ALIGN, promise) { writeInt(alignment) }
            }
        }

        AsyncFunction("printText") { text: String, promise: Promise ->
            withBinder(promise) { binder ->
                transactWithCallback(binder, TX.PRINT_TEXT, promise) { writeString(text) }
            }
        }

        AsyncFunction("printSpecifiedTypeText") { text: String, fontName: String, fontSize: Int, promise: Promise ->
            withBinder(promise) { binder ->
                transactWithCallback(binder, TX.PRINT_SPEC, promise) {
                    writeString(text); writeString(fontName); writeInt(fontSize)
                }
            }
        }

        AsyncFunction("printColumnsText") { textArray: List<String>, widthArray: List<Int>, alignArray: List<Int>, promise: Promise ->
            withBinder(promise) { binder ->
                transactWithCallback(binder, TX.PRINT_COLUMNS, promise) {
                    writeStringArray(textArray.toTypedArray())
                    writeIntArray(widthArray.toIntArray())
                    writeIntArray(alignArray.toIntArray())
                    // The decompiled service expects an extra integer (isTable/mode) before the callback
                    writeInt(0)
                }
            }
        }

        AsyncFunction("printBitmap") { alignment: Int, bitmapWidth: Int, base64Image: String, promise: Promise ->
            withBinder(promise) { binder ->
                val bytes = Base64.decode(base64Image, Base64.DEFAULT)
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                if (bitmap == null) {
                    promise.reject("ERR_DECODE_BITMAP", "Failed to decode base64 bitmap", null)
                    return@withBinder
                }
                val id = callbackIdGen.incrementAndGet()
                val data = Parcel.obtain(); val reply = Parcel.obtain()
                val callback = PrinterCallback(
                    onResult = { activeCallbacks.remove(id); promise.resolve(it) },
                    onString = { activeCallbacks.remove(id); promise.resolve(it) }
                )
                activeCallbacks[id] = callback
                try {
                    data.writeInterfaceToken(DESCRIPTOR)
                    data.writeInt(alignment); data.writeInt(bitmapWidth)
                    bitmap.writeToParcel(data, 0)
                    data.writeStrongBinder(callback)
                    binder.transact(TX.PRINT_BITMAP, data, reply, 0)
                    reply.readException()
                } catch (e: Exception) {
                    activeCallbacks.remove(id)
                    promise.reject("ERR_PRINT_BITMAP", e.message, e)
                } finally { data.recycle(); reply.recycle() }
            }
        }

        AsyncFunction("printBarCode") { barData: String, symbology: Int, height: Int, width: Int, alignment: Int, promise: Promise ->
            withBinder(promise) { binder ->
                transactWithCallback(binder, TX.PRINT_BARCODE, promise) {
                    writeString(barData); writeInt(symbology); writeInt(height); writeInt(width); writeInt(alignment)
                }
            }
        }

        AsyncFunction("printQRCode") { qrData: String, moduleSize: Int, errorLevel: Int, promise: Promise ->
            withBinder(promise) { binder ->
                transactWithCallback(binder, TX.PRINT_QR, promise) {
                    writeString(qrData); writeInt(moduleSize); writeInt(errorLevel)
                }
            }
        }

        AsyncFunction("printRawData") { base64Data: String, promise: Promise ->
            withBinder(promise) { binder ->
                transactWithCallback(binder, TX.PRINT_RAW, promise) {
                    writeByteArray(Base64.decode(base64Data, Base64.DEFAULT))
                }
            }
        }

        AsyncFunction("sendRAWData") { base64Data: String, promise: Promise ->
            withBinder(promise) { binder ->
                transactWithCallback(binder, TX.SEND_CMD, promise) {
                    writeByteArray(Base64.decode(base64Data, Base64.DEFAULT))
                }
            }
        }

        AsyncFunction("printerPerformPrint") { feedLines: Int, promise: Promise ->
            withBinder(promise) { binder ->
                transactWithCallback(binder, TX.PERFORM_PRINT, promise) { writeInt(feedLines) }
            }
        }

        AsyncFunction("printLine") { lines: Int, promise: Promise ->
            withBinder(promise) { binder ->
                transactWithCallback(binder, TX.FEED_LINES, promise) { writeInt(lines) }
            }
        }



        AsyncFunction("printTable") { textArray: List<String>, widthArray: List<Int>, alignArray: List<Int>, promise: Promise ->
            withBinder(promise) { binder ->
                transactWithCallback(binder, TX.PRINT_COLUMNS, promise) {
                    writeStringArray(textArray.toTypedArray())
                    writeIntArray(widthArray.toIntArray())
                    writeIntArray(alignArray.toIntArray())
                    writeInt(1) // isTable = 1
                }
            }
        }
    }
}
