package expo.modules.z100printer

import android.os.Build
import android.os.Environment
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.PrintWriter
import java.io.StringWriter
import java.lang.reflect.Modifier

class Z100PrinterModule : Module() {
  private var posApi: Any? = null

  companion object {
    private const val TAG = "Z100Printer"
    private const val LOG_FILE_NAME = "printer_debug.log"
    private const val POS_API_HELPER = "vpos.apipackage.PosApiHelper"
    private const val PRINT_WRAPPER = "vpos.apipackage.Print"
    private var logFile: File? = null

    @JvmStatic
    fun initLogger(filesDir: File) {
      logFile = File(filesDir, LOG_FILE_NAME)
      if (logFile?.exists() != true) logFile?.createNewFile()
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
          fos.write("[${System.currentTimeMillis()}] $msg\n".toByteArray())
        }
        Log.d(TAG, msg)
      } catch (e: Exception) {
        Log.e(TAG, "Log write failed: ${e.message}")
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
      logMessage("NATIVE: AAR-based SDK; skipping manual .so loading")
    }
  }

  private fun sdkClass(className: String): Class<*> = Class.forName(className)

  private fun getPosApiInstance(): Any? {
    posApi?.let { return it }
    return try {
      val cls = sdkClass(POS_API_HELPER)
      val method = cls.methods.firstOrNull { it.name == "getInstance" && it.parameterTypes.isEmpty() }
      val instance = method?.invoke(null)
      posApi = instance
      logMessage("SDK getInstance result=${instance != null}")
      instance
    } catch (e: Throwable) {
      logMessage("SDK getInstance failed: ${e.message}")
      null
    }
  }

  private fun newPrintWrapper(): Any? = try {
    sdkClass(PRINT_WRAPPER).getDeclaredConstructor().newInstance()
  } catch (e: Throwable) {
    null
  }

  private fun sdkTarget(className: String, method: java.lang.reflect.Method, explicitTarget: Any?): Any? {
    if (Modifier.isStatic(method.modifiers)) return null
    if (explicitTarget != null) return explicitTarget
    return when (className) {
      POS_API_HELPER -> getPosApiInstance()
      PRINT_WRAPPER -> newPrintWrapper()
      else -> sdkClass(className).getDeclaredConstructor().newInstance()
    }
  }

  private fun invokeSdkAny(
    label: String,
    className: String,
    methodName: String,
    explicitTarget: Any? = null,
    vararg args: Any
  ): Any? {
    return try {
      val cls = sdkClass(className)
      val method = cls.methods.firstOrNull { it.name == methodName && it.parameterTypes.size == args.size }
      if (method == null) {
        logMessage("$label: $className.$methodName(${args.size}) not found")
        return null
      }
      val target = sdkTarget(className, method, explicitTarget)
      val result = method.invoke(target, *args)
      logMessage("$label: $className.$methodName result=$result")
      result
    } catch (e: Throwable) {
      logMessage("$label failed: ${e.message}")
      null
    }
  }

  private fun invokeSdkInt(label: String, className: String, methodName: String, explicitTarget: Any? = null, vararg args: Any): Int? {
    return (invokeSdkAny(label, className, methodName, explicitTarget, *args) as? Number)?.toInt()
  }

  private fun invokePrintStr(label: String, text: String): Int? {
    val result = invokeSdkInt(label, POS_API_HELPER, "PrintStr", null, text)
    logMessage("$label argType=String bytes=${text.toByteArray().size} result=$result")
    return result
  }

  private fun readBatteryVoltageRaw(): Int? {
    val paths = listOf(
      "/sys/class/power_supply/battery/batt_vol",
      "/sys/class/power_supply/battery/voltage_now"
    )
    for (path in paths) {
      try {
        val value = File(path).takeIf { it.exists() }?.readText()?.trim()?.toLongOrNull() ?: continue
        return value.toInt()
      } catch (_: Throwable) {
      }
    }
    return null
  }

  private fun correctedVoltageSetting(): Int {
    val raw = readBatteryVoltageRaw()
    val setting = if (raw != null && raw > 0) (raw * 2) / 100 else 76000
    logMessage("battery voltage raw=$raw correctedSetting=$setting")
    return setting
  }

  private fun configureVoltage(label: String) {
    val setting = correctedVoltageSetting()
    invokeSdkInt("$label isCharge", PRINT_WRAPPER, "Lib_PrnIsCharge", null, setting)
    invokeSdkInt("$label setVoltage", PRINT_WRAPPER, "Lib_PrnSetVoltage", null, setting)
  }

  private fun setPlainFont(label: String) {
    val result = invokeSdkInt(label, POS_API_HELPER, "PrintSetFont", null, 16.toByte(), 24.toByte(), 0x00.toByte())
    logMessage("$label plain font result=$result width=16 height=24 zoom=0")
  }

  private fun directPrintStart(label: String): Int? {
    configureVoltage(label)
    return invokeSdkInt("$label", PRINT_WRAPPER, "Lib_PrnStart")
      ?: invokeSdkInt("$label fallback", POS_API_HELPER, "PrintStart")
  }

  private fun checkStatusLine(label: String): Int {
    configureVoltage(label)
    val helper = invokeSdkInt("$label helper", POS_API_HELPER, "PrintCheckStatus")
    val lib = invokeSdkInt("$label lib", PRINT_WRAPPER, "Lib_PrnCheckStatus")
    val final = lib ?: helper ?: -999
    logMessage("$label result: helper=$helper lib=$lib final=$final")
    return final
  }

  override fun definition() = ModuleDefinition {
    Name("Z100Printer")

    OnCreate {
      val filesDir = appContext.reactContext?.filesDir ?: File("/tmp")
      initLogger(filesDir)
      loadLibraries("")
    }

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
      } catch (_: Exception) {
        return@AsyncFunction false
      }
    }

    AsyncFunction("recordLog") { message: String ->
      logMessage("JS: $message")
      return@AsyncFunction true
    }

    AsyncFunction("saveLogsToDevice") {
      try {
        val context = appContext.reactContext ?: return@AsyncFunction "No Android context"
        val source = logFile ?: return@AsyncFunction "Logger not initialized"
        val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS) ?: context.filesDir
        val target = File(dir, "z100-printer-log.txt")
        target.writeText(if (source.exists()) source.readText() else "")
        logMessage("Saved printer log to ${target.absolutePath}")
        return@AsyncFunction target.absolutePath
      } catch (e: Throwable) {
        logMessage("saveLogsToDevice failed: ${e.message}")
        return@AsyncFunction "Failed: ${e.message}"
      }
    }

    AsyncFunction("diagnoseUart") {
      val ports = listOf("/dev/ttyMT1", "/dev/ttyMT2", "/dev/ttyMT0", "/dev/ttyS0", "/dev/ttyS1", "/dev/ttyS2")
      val results = ports.map { port ->
        val f = File(port)
        when {
          !f.exists() -> "$port: NOT_FOUND"
          !f.canRead() || !f.canWrite() -> "$port: PERMISSION_DENIED (canRead=${f.canRead()} canWrite=${f.canWrite()})"
          else -> "$port: OK"
        }
      }
      logMessage("UART Diagnostics: ${results.joinToString(", ")}")
      return@AsyncFunction results
    }

    AsyncFunction("getDiagnostics") {
      val lines = mutableListOf<String>()
      getPosApiInstance()
      listOf("getAARVersion", "getOSVersion", "getMcuTargetVersion").forEach { method ->
        val value = invokeSdkAny("diagnostics", POS_API_HELPER, method)
        lines.add("$method: $value")
      }
      lines.add("status: ${checkStatusLine("status")}")
      logMessage("Diagnostics captured")
      return@AsyncFunction lines
    }

    AsyncFunction("isZ100Device") {
      val buildText = listOf(Build.MODEL, Build.DEVICE, Build.PRODUCT, Build.HARDWARE, Build.MANUFACTURER, Build.BRAND)
        .joinToString(" ") { it ?: "" }
        .lowercase()
      val hasPorts = listOf("/dev/ttyMT1", "/dev/ttyMT2", "/dev/ttyMT0").any { File(it).exists() }
      val hasSdk = try { sdkClass(POS_API_HELPER); true } catch (_: Throwable) { false }
      val isZ100 = buildText.contains("z100") || buildText.contains("a26") || (hasSdk && hasPorts)
      logMessage("isZ100Device=$isZ100 build=\"$buildText\" hasSdk=$hasSdk hasPorts=$hasPorts")
      return@AsyncFunction isZ100
    }

    AsyncFunction("printInit") {
      try {
        logMessage("printInit requested")
        getPosApiInstance()
        val configured = invokeSdkInt("printInit configured", POS_API_HELPER, "PrintInit", null, 2, 24, 16, 0x00)
        val fallback = if (configured == null || configured != 0) invokeSdkInt("printInit", POS_API_HELPER, "PrintInit") else configured
        logMessage("printInit results configuredHelper=$configured helper=$fallback lib=null")
        val status = checkStatusLine("printInit status after")
        logMessage("printInit status after final=$status")
        return@AsyncFunction fallback == 0 || configured == 0
      } catch (e: Throwable) {
        logError("printInit", e)
        return@AsyncFunction false
      }
    }

    AsyncFunction("printString") { text: String, size: Int?, align: Int?, zoom: Int? ->
      try {
        val safeAlign = align ?: 0
        logMessage("printString request: align=$safeAlign requestedSize=${size ?: 24} rawZoom=${zoom ?: 0} bytes=${text.toByteArray().size} text=${text.take(80).replace("\n", "\\n")}")
        val alignResult = invokeSdkInt("printString align", POS_API_HELPER, "PrintSetAlign", null, safeAlign)
        logMessage("printString align results helper=$alignResult lib=null align=$safeAlign")
        setPlainFont("printString font")
        val result = invokePrintStr("printString text", text)
        logMessage("printString result: final=$result helper=$result lib=null align=$safeAlign requestedSize=${size ?: 24}")
        return@AsyncFunction result == 0
      } catch (e: Throwable) {
        logError("printString", e)
        return@AsyncFunction false
      }
    }

    AsyncFunction("printQrCode") { content: String, width: Int, height: Int ->
      try {
        val barcodeFormat = Class.forName("com.google.zxing.BarcodeFormat")
        val qr = barcodeFormat.enumConstants.firstOrNull { it.toString() == "QR_CODE" }
        val target = getPosApiInstance()
        val result = invokeSdkInt("printQrCode", POS_API_HELPER, "PrintBarcode", target, content, width, height, qr as Any)
        return@AsyncFunction result == 0
      } catch (e: Throwable) {
        logMessage("printQrCode skipped: ${e.message}")
        return@AsyncFunction false
      }
    }

    AsyncFunction("printStart") {
      try {
        Thread.sleep(300)
        val libStartResult = directPrintStart("printStart")
        logMessage("printStart results lib=$libStartResult helper=null")
        logMessage("printStart trailing feed skipped; using queued receipt blank lines")
        if (libStartResult != 0) {
          logMessage("printStart failed; closing helper printer handle to avoid locking other SDK apps")
          val closeHelper = invokeSdkInt("printStart failure close", POS_API_HELPER, "PrintClose")
          logMessage("printStart failure close results helper=$closeHelper lib=null")
        }
        return@AsyncFunction libStartResult == 0
      } catch (e: Throwable) {
        logError("printStart", e)
        return@AsyncFunction false
      }
    }

    AsyncFunction("printSdkSample") {
      try {
        logMessage("printSdkSample requested")
        invokeSdkInt("printSdkSample pre-close", POS_API_HELPER, "PrintClose")
        val init = invokeSdkInt("printSdkSample low-power init", POS_API_HELPER, "PrintInit", null, 2, 24, 16, 0x00)
        logMessage("printSdkSample init result=$init")
        val first = invokePrintStr("printSdkSample text1", "Print Tile\n")
        setPlainFont("printSdkSample font")
        val dash = invokePrintStr("printSdkSample text2", "- - - - - - - - - - - -\n")
        val second = invokePrintStr("printSdkSample text3", " Print Str2 \n")
        val feed = invokePrintStr("printSdkSample text4", "\n\n")
        logMessage("printSdkSample text results first=$first dash=$dash second=$second feed=$feed")
        logMessage("printSdkSample direct start with no status check")
        val start = directPrintStart("printSdkSample start")
        logMessage("printSdkSample start result=$start")
        Thread.sleep(700)
        val close = invokeSdkInt("printSdkSample close", POS_API_HELPER, "PrintClose")
        logMessage("printSdkSample close result=$close")
        return@AsyncFunction start == 0
      } catch (e: Throwable) {
        logError("printSdkSample", e)
        return@AsyncFunction false
      }
    }

    AsyncFunction("printClose") {
      logMessage("printClose requested")
      val closeHelper = invokeSdkInt("printClose", POS_API_HELPER, "PrintClose")
      logMessage("printClose results helper=$closeHelper lib=null")
      posApi = null
      logMessage("printClose: released PosApiHelper reference")
      return@AsyncFunction closeHelper == 0 || closeHelper == null
    }

    AsyncFunction("printSetVoltage") { voltage: Int ->
      val result = invokeSdkInt("printSetVoltage", PRINT_WRAPPER, "Lib_PrnSetVoltage", null, voltage)
      return@AsyncFunction result == 0 || result == null
    }

    AsyncFunction("printSetGray") { gray: Int ->
      val result = invokeSdkInt("printSetGray", POS_API_HELPER, "PrintSetGray", null, gray)
      return@AsyncFunction result == 0 || result == null
    }

    AsyncFunction("checkStatus") {
      return@AsyncFunction checkStatusLine("checkStatus")
    }
  }
}
