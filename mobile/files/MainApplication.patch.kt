// android/app/src/main/java/com/<yourapp>/MainApplication.kt
// Add HCCPrinterPackage to getPackages()

// BEFORE:
override fun getPackages(): List<ReactPackage> = PackageList(this).packages

// AFTER:
override fun getPackages(): List<ReactPackage> =
    PackageList(this).packages + listOf(HCCPrinterPackage())

// Also add the import at the top of the file:
import com.hccprinter.HCCPrinterPackage
