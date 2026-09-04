package com.iposprinter.iposprinterservice;

/**
 * Callback interface for execution results of iPOS print service
 */
interface IPosPrinterCallback {
    oneway void onRunResult(boolean isSuccess);
    oneway void onReturnString(String result);
}
