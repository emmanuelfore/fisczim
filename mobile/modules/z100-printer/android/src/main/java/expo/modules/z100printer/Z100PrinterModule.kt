package expo.modules.z100printer

import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import vpos.apipackage.PosApiHelper
import vpos.apipackage.PrintInitException
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.io.FileOutputStream

class Z100PrinterModule : Module() {
  // posApi instance is only needed for PrintBarcode / PrintBmp (true instance methods)
  private var posApi: PosApiHelper? = null

  companion object {
    private const val TAG = "Z100Printer"
    private const val LOG_FILE_NAME = "printer_debug.log"
    private var logFile: File? = null

    @JvmStatic
    fun initLogger(filesDir: File) {
      logFile = File(filesDir, LOG_FILE_NAME)
      if (!logFile!!.exists()) {
        logFile!!.createNewFile()
      }

      val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
      Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
        logError("FATAL_CRASH", throwable)
        defaultHandler?.uncaughtException(thread, throwable)
      }

      logMessage("Logger initialized at ${System.currentTimeMillis()}")
    }

    @JvmStatic
    @Synchronized
    fun logMessage(msg: String) {
      try {
        val file = logFile ?: return
        FileOutputStream(file, true).use { fos ->
          val line = "[${System.currentTimeMillis()}] $msg\n"
          fos.write(line.toByteArray())
        }
        Log.d(TAG, msg)
      } catch (e: Exception) {
        Log.e(TAG, "Failed to write log", e)
      }
    }

    @JvmStatic
    fun logError(context: String, t: Throwable) {
      val sw = StringWriter()
      t.printStackTrace(PrintWriter(sw))
      logMessage("ERROR in $context: ${t.message}\n${sw}")
      Log.e(TAG, "Error in $context", t)
    }

    @JvmStatic
    fun loadLibraries(libDir: String) {
      logMessage("NATIVE: Starting library load")
      // With PosApiSdk.aar, the native lib (libAndroid.so) is bundled inside the AAR.
      // Android extracts it automatically — no manual loading required.
      logMessage("NATIVE: AAR-based SDK; skipping manual .so loading")
    }

    init {
      // No auto-loading here to avoid crashing during class loading
    }
  }

  override fun definition() = ModuleDefinition {
    Name("Z100Printer")

    OnCreate {
      val reactContext = appContext.reactContext
      val filesDir = reactContext?.filesDir ?: File("/tmp")
      initLogger(filesDir)
      loadLibraries("")
    }

    // ─── Diagnostics ────────────────────────────────────────────────────────

    AsyncFunction("getLogs") {
      try {
        val file = logFile ?: return@AsyncFunction listOf("Logger not initialized")
        if (!file.exists()) return@AsyncFunction listOf("Log file missing")
        return@AsyncFunction file.readLines()
      } catch (e: Exception) {
        return@AsyncFunction listOf("Failed to read logs: ${e.message}")
      }
    }

    AsyncFunction("clearLogs") {
      try {
        logFile?.delete()
        logFile?.createNewFile()
        logMessage("Logs cleared")
        return@AsyncFunction true
      } catch (e: Exception) {
        return@AsyncFunction false
      }
    }

    AsyncFunction("diagnoseUart") {
      val ports = listOf("/dev/ttyMT1", "/dev/ttyMT2", "/dev/ttyMT0", "/dev/ttyS0", "/dev/ttyS1", "/dev/ttyS2")
      val results = mutableListOf<String>()
      for (port in ports) {
        val f = File(port)
        when {
          !f.exists() -> results.add("$port: NOT_FOUND")
          !f.canRead() || !f.canWrite() -> results.add("$port: PERMISSION_DENIED (canRead=${f.canRead()} canWrite=${f.canWrite()})")
          else -> {
            results.add("$port: OK")
            try {
              val raf = java.io.RandomAccessFile(f, "rw")
              raf.close()
            } catch (e: Exception) {
              results.add("$port: OPEN_FAIL (${e.message})")
            }
          }
        }
      }
      logMessage("UART Diagnostics: " + results.joinToString(", "))
      return@AsyncFunction results
    }

    // ─── Printer lifecycle ──────────────────────────────────────────────────
    // NOTE: In PosApiSdk.aar, most print methods are STATIC on PosApiHelper.
    // Only PrintBarcode and PrintBmp are instance methods on the PosApiHelper singleton.

    AsyncFunction("printInit") {
      try {
        logMessage("Calling PrintInit (static)")
        // Ensure singleton is fetched so instance methods (PrintBarcode) work later
        if (posApi == null) {
          posApi = PosApiHelper.getInstance()
        }
        val result = PosApiHelper.PrintInit()
        logMessage("printInit result: $result")
        return@AsyncFunction result == 0
      } catch (e: PrintInitException) {
        logMessage("printInit PrintInitException code: ${e.exceptionCode}")
        return@AsyncFunction false
      } catch (e: Throwable) {
        logError("printInit", e)
        return@AsyncFunction false
      }
    }

    AsyncFunction("printClose") {
      // PrintClose() does not exist in this SDK version — releasing the reference is sufficient
      posApi = null
      logMessage("printClose: released PosApiHelper reference")
      return@AsyncFunction true
    }

    AsyncFunction("checkStatus") {
      try {
        val result = PosApiHelper.PrintCheckStatus()
        logMessage("checkStatus result: $result")
        return@AsyncFunction result
      } catch (e: Throwable) {
        logError("checkStatus", e)
        return@AsyncFunction -1
      }
    }

    // ─── Queue operations ───────────────────────────────────────────────────

    AsyncFunction("printString") { text: String, size: Int?, align: Int?, zoom: Int? ->
      try {
        val fontSize = size ?: 24
        val w: Byte = (fontSize / 4).toByte()
        val h: Byte = w
        val type: Byte = (zoom ?: 0).toByte()
        PosApiHelper.PrintSetFont(w, h, type)
        val result = PosApiHelper.PrintStr(text)
        return@AsyncFunction result == 0
      } catch (e: Throwable) {
        logError("printString", e)
        return@AsyncFunction false
      }
    }

    AsyncFunction("printQrCode") { content: String, width: Int, height: Int ->
      // PrintBarcode is an instance method — ensure singleton exists
      if (posApi == null) {
        logMessage("printQrCode: posApi null, re-fetching singleton")
        posApi = PosApiHelper.getInstance()
      }
      try {
        val result = posApi!!.PrintBarcode(
          content, width, height,
          com.google.zxing.BarcodeFormat.QR_CODE
        )
        logMessage("printQrCode result: $result")
        return@AsyncFunction result == 0
      } catch (e: Throwable) {
        logError("printQrCode", e)
        return@AsyncFunction false
      }
    }

    AsyncFunction("printStart") {
      try {
        val result = PosApiHelper.PrintStart()
        logMessage("printStart result: $result")
        return@AsyncFunction result == 0
      } catch (e: Throwable) {
        logError("printStart", e)
        return@AsyncFunction false
      }
    }

    // ─── Print settings ─────────────────────────────────────────────────────

    AsyncFunction("printSetVoltage") { voltage: Int ->
      try {
        PosApiHelper.PrintSetVoltage(voltage)
        return@AsyncFunction true
      } catch (e: Throwable) {
        logError("printSetVoltage", e)
        return@AsyncFunction false
      }
    }

    AsyncFunction("printSetGray") { gray: Int ->
      try {
        PosApiHelper.PrintSetGray(gray)
        return@AsyncFunction true
      } catch (e: Throwable) {
        logError("printSetGray", e)
        return@AsyncFunction false
      }
    }
  }
}