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

      // Add global crash handler to capture final breath
      val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
      Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
        logError("FATAL_CRASH", throwable)
        defaultHandler?.uncaughtException(thread, throwable)
      }

      logMessage("Logger initialized at ${System.currentTimeMillis()}")
    }

    // FIX #4: @Synchronized prevents concurrent FileOutputStream corruption
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
      logMessage("NATIVE: Starting absolute path load (Namespace Bypass)")

      val libraries = listOf(
        "c++", "nativehelper", "cutils", "pcre", "backtrace", "hardware", "memtrack",
        "android_runtime", "utils", "binder", "ui", "selinux", "mrdump", "ged", "aed",
        "custom_prop", "custom_nvram", "custom_jni", "VisaLib", "PaypassApi", "PosApi"
      )

      try {
        logMessage("NATIVE: Lib directory: $libDir")

        for (libName in libraries) {
          try {
            val libFile = File(libDir, "lib$libName.so")
            if (libFile.exists()) {
              System.load(libFile.absolutePath)
              logMessage("NATIVE: ✓ loaded $libName from FS")
            } else {
              System.loadLibrary(libName)
              logMessage("NATIVE: ✓ loaded $libName via linker")
            }
          } catch (e: Throwable) {
            logMessage("NATIVE: ✗ failed $libName: ${e.message}")
          }
        }
      } catch (e: Throwable) {
        logError("LOAD_SYSTEM", e)
        // Fallback
        for (libName in libraries) {
          try { System.loadLibrary(libName) } catch (t: Throwable) {}
        }
      }

      logMessage("NATIVE: Load sequence complete")
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
      val libDir = reactContext?.applicationInfo?.nativeLibraryDir ?: ""
      loadLibraries(libDir)
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
        if (!f.exists()) {
           results.add("$port: NOT_FOUND")
        } else if (!f.canRead() || !f.canWrite()) {
           results.add("$port: PERMISSION_DENIED (canRead=${f.canRead()} canWrite=${f.canWrite()})")
        } else {
           results.add("$port: OK")
           try {
             val raf = java.io.RandomAccessFile(f, "rw")
             raf.close()
           } catch(e: Exception) {
             results.add("$port: OPEN_FAIL (${e.message})")
           }
        }
      }
      logMessage("UART Diagnostics: " + results.joinToString(", "))
      return@AsyncFunction results
    }

    // ─── Printer lifecycle ──────────────────────────────────────────────────

    AsyncFunction("printInit") {
      try {
        logMessage("Calling printInit")
        if (posApi == null) {
          posApi = PosApiHelper.getInstance()
        }
        val result = posApi?.PrintInit() ?: -1
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
        val result = posApi?.PrintCheckStatus() ?: -1
        logMessage("checkStatus result: $result")
        return@AsyncFunction result
      } catch (e: Throwable) {
        logError("checkStatus", e)
        return@AsyncFunction -1
      }
    }

    // ─── Queue operations ───────────────────────────────────────────────────

    AsyncFunction("printString") { text: String, size: Int?, align: Int?, zoom: Int? ->
      // FIX #1: null guard
      if (posApi == null) {
        logMessage("printString: posApi not initialized")
        return@AsyncFunction false
      }
      try {
        // PrintSetAlign not available in this SDK version — alignment handled by default
        // SDK signature: PrintSetFont(width, height, type)
        val fontSize = size ?: 24
        val w: Byte = (fontSize / 4).toByte()
        val h: Byte = w
        val type: Byte = (zoom ?: 0).toByte()
        posApi?.PrintSetFont(w, h, type)

        // FIX #2: safe null-coerce before comparing
        val result = posApi?.PrintStr(text) ?: -1
        return@AsyncFunction result == 0
      } catch (e: Throwable) {
        logError("printString", e)
        return@AsyncFunction false
      }
    }

    AsyncFunction("printQrCode") { content: String, width: Int, height: Int ->
      // FIX #1: null guard
      if (posApi == null) {
        logMessage("printQrCode: posApi not initialized")
        return@AsyncFunction false
      }
      try {
        // Use PrintBarcode for QR (PrintQrCode_Cut not available in this SDK version)
        val result = posApi?.PrintBarcode(content, width, height, 2) ?: -1
        logMessage("printQrCode result: $result")
        return@AsyncFunction result == 0
      } catch (e: Throwable) {
        logError("printQrCode", e)
        return@AsyncFunction false
      }
    }

    AsyncFunction("printStart") {
      // FIX #1: null guard
      if (posApi == null) {
        logMessage("printStart: posApi not initialized")
        return@AsyncFunction false
      }
      try {
        val result = posApi?.PrintStart() ?: -1
        logMessage("printStart result: $result")
        return@AsyncFunction result == 0
      } catch (e: Throwable) {
        logError("printStart", e)
        return@AsyncFunction false
      }
    }

    // ─── Print settings ─────────────────────────────────────────────────────

    AsyncFunction("printSetVoltage") { voltage: Int ->
      if (posApi == null) {
        logMessage("printSetVoltage: posApi not initialized")
        return@AsyncFunction false
      }
      try {
        posApi?.PrintSetVoltage(voltage)
        return@AsyncFunction true
      } catch (e: Throwable) {
        logError("printSetVoltage", e)
        return@AsyncFunction false
      }
    }

    AsyncFunction("printSetGray") { gray: Int ->
      if (posApi == null) {
        logMessage("printSetGray: posApi not initialized")
        return@AsyncFunction false
      }
      try {
        posApi?.PrintSetGray(gray)
        return@AsyncFunction true
      } catch (e: Throwable) {
        logError("printSetGray", e)
        return@AsyncFunction false
      }
    }
  }
}