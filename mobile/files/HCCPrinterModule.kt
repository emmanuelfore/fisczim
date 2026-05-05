package com.hccprinter

import com.facebook.react.bridge.*
import vpos.apipackage.PosApiHelper
import vpos.apipackage.PrintInitException
import com.google.zxing.BarcodeFormat

/**
 * React Native Native Module for HCC Z100/CS10 POS Printer
 *
 * SDK class: vpos.apipackage.PosApiHelper (singleton via getInstance())
 *
 * Method channel mirrors the Flutter plugin's contract exactly:
 *   printInit        -> 0 = success, error code otherwise
 *   printString      -> text, align, fontSize, zoom
 *   printStart       -> triggers actual print
 *   printClose       -> clears queue
 *   printCheckStatus -> returns status code
 *   printQrCode      -> data, width, height
 */
class HCCPrinterModule(reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "HCCPrinter"

        // Return codes that match the Flutter plugin's PrinterCodes
        const val SUCCESS = 0
        const val NOT_INITIALIZED = 9998

        // Alignment constants (matches Flutter plugin: start=0, center=1, end=2)
        const val ALIGN_LEFT   = 0
        const val ALIGN_CENTER = 1
        const val ALIGN_RIGHT  = 2

        // Font size defaults (Flutter plugin passes fontSize as int: 16/20/24/28)
        const val DEFAULT_FONT_WIDTH:  Byte = 0
        const val DEFAULT_FONT_HEIGHT: Byte = 0
        const val DEFAULT_FONT_TYPE:   Byte = 0
    }

    private val posApi: PosApiHelper = PosApiHelper.getInstance()
    private var isInitialized = false

    override fun getName() = NAME

    // ─── printInit ────────────────────────────────────────────────────────────
    @ReactMethod
    fun printInit(promise: Promise) {
        try {
            val result = posApi.PrintInit()  // throws PrintInitException
            isInitialized = (result == SUCCESS)
            promise.resolve(result)
        } catch (e: PrintInitException) {
            isInitialized = false
            promise.resolve(e.exceptionCode)
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", e.message)
        }
    }

    // ─── printString ──────────────────────────────────────────────────────────
    // Arguments: { text: String, align: Int, fontSize: Int, zoom: Int }
    @ReactMethod
    fun printString(options: ReadableMap, promise: Promise) {
        if (!isInitialized) { promise.resolve(NOT_INITIALIZED); return }
        try {
            val text     = options.getString("text")     ?: ""
            val align    = if (options.hasKey("align"))    options.getInt("align")    else ALIGN_LEFT
            val fontSize = if (options.hasKey("fontSize")) options.getInt("fontSize") else 24
            val zoom     = if (options.hasKey("zoom"))     options.getInt("zoom")     else 0

            // Set alignment (0=left, 1=center, 2=right)
            posApi.PrintSetAlign(align)

            // Map fontSize int to font height byte (SDK uses byte params)
            // Flutter plugin sizes: xsmall=16, small=20, medium=24, large=28
            val fontHeight: Byte = (fontSize / 4).toByte()  // scale to SDK range
            val fontWidth:  Byte = fontHeight
            val fontType:   Byte = if (zoom > 0) 1 else 0   // zoom 33 = bold

            posApi.PrintSetFont(fontWidth, fontHeight, fontType)

            val result = posApi.PrintStr(text)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("PRINT_STRING_ERROR", e.message)
        }
    }

    // ─── printStart ───────────────────────────────────────────────────────────
    @ReactMethod
    fun printStart(promise: Promise) {
        if (!isInitialized) { promise.resolve(NOT_INITIALIZED); return }
        try {
            val result = posApi.PrintStart()
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("PRINT_START_ERROR", e.message)
        }
    }

    // ─── printClose ───────────────────────────────────────────────────────────
    @ReactMethod
    fun printClose(promise: Promise) {
        try {
            val result = posApi.PrintClose()
            isInitialized = false
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("PRINT_CLOSE_ERROR", e.message)
        }
    }

    // ─── printCheckStatus ─────────────────────────────────────────────────────
    @ReactMethod
    fun printCheckStatus(promise: Promise) {
        try {
            val result = posApi.PrintCheckStatus()
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("STATUS_ERROR", e.message)
        }
    }

    // ─── printQrCode ──────────────────────────────────────────────────────────
    // Arguments: { data: String, width: Int, height: Int }
    @ReactMethod
    fun printQrCode(options: ReadableMap, promise: Promise) {
        if (!isInitialized) { promise.resolve(NOT_INITIALIZED); return }
        try {
            val data   = options.getString("data")   ?: ""
            val width  = if (options.hasKey("width"))  options.getInt("width")  else 300
            val height = if (options.hasKey("height")) options.getInt("height") else 300

            val result = posApi.PrintQrCode_Cut(data, width, height, BarcodeFormat.QR_CODE)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("PRINT_QR_ERROR", e.message)
        }
    }
}
