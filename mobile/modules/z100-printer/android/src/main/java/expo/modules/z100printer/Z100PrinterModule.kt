package expo.modules.z100printer

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import vpos.apipackage.PosApiHelper

class Z100PrinterModule : Module() {
  private var posApi: PosApiHelper? = null

  override fun definition() = ModuleDefinition {
    Name("Z100Printer")

    AsyncFunction("printInit") {
      try {
        if (posApi == null) {
          posApi = PosApiHelper.getInstance()
        }
        val result = posApi?.PrintInit() ?: -1
        return@AsyncFunction result == 0
      } catch (e: Throwable) {
        return@AsyncFunction false
      }
    }

    AsyncFunction("printString") { text: String, size: Int?, align: Int? ->
      try {
        if (size != null) {
          posApi?.PrintSetFont(size.toByte(), size.toByte(), 0.toByte())
        }
        if (align != null) {
          posApi?.PrintSetAlign(align)
        }
        posApi?.PrintStr(text)
        return@AsyncFunction true
      } catch (e: Throwable) {
        return@AsyncFunction false
      }
    }

    AsyncFunction("printStart") {
      try {
        val result = posApi?.PrintStart() ?: -1
        return@AsyncFunction result == 0
      } catch (e: Throwable) {
        return@AsyncFunction false
      }
    }

    AsyncFunction("printClose") {
      try {
        val result = posApi?.PrintClose() ?: -1
        posApi = null // Release instance reference
        return@AsyncFunction result == 0
      } catch (e: Throwable) {
        return@AsyncFunction false
      }
    }

    AsyncFunction("printSetVoltage") { voltage: Int ->
      try {
        posApi?.PrintSetVoltage(voltage)
        return@AsyncFunction true
      } catch (e: Throwable) {
        return@AsyncFunction false
      }
    }

    AsyncFunction("printSetGray") { gray: Int ->
      try {
        posApi?.PrintSetGray(gray)
        return@AsyncFunction true
      } catch (e: Throwable) {
        return@AsyncFunction false
      }
    }

    AsyncFunction("checkStatus") {
      try {
        val result = posApi?.PrintCheckStatus() ?: -1
        return@AsyncFunction result
      } catch (e: Throwable) {
        return@AsyncFunction -1
      }
    }
  }
}
