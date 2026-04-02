const fs = require("fs");
const filePath = "c:\\Users\\Emmanuel\\Documents\\PROJECTS\\fisczim\\client\\src\\pages\\pos.tsx";
let content = fs.readFileSync(filePath, "utf8");

// Add state
if (!content.includes("isFiscalized")) {
  content = content.replace(
    "const [isFullscreen, setIsFullscreen] = useState(false);",
    "const [isFullscreen, setIsFullscreen] = useState(false);\n    const [isFiscalized, setIsFiscalized] = useState(true);"
  );
}

// Update persistence
if (content.includes("savedPaymentMethod") && !content.includes("savedFiscalized")) {
  content = content.replace(
    "if (savedPaymentMethod) setPaymentMethod(savedPaymentMethod);",
    "if (savedPaymentMethod) setPaymentMethod(savedPaymentMethod);\n            const savedFiscalized = localStorage.getItem(`${prefix}isFiscalized`);\n            if (savedFiscalized !== null) setIsFiscalized(savedFiscalized === \"true\");"
  );
}

// Save persistence
if (content.includes("localStorage.setItem(`${prefix}paymentMethod`, paymentMethod);") && !content.includes("isFiscalized.toString()")) {
  content = content.replace(
    "localStorage.setItem(`${prefix}paymentMethod`, paymentMethod);",
    "localStorage.setItem(`${prefix}paymentMethod`, paymentMethod);\n        localStorage.setItem(`${prefix}isFiscalized`, isFiscalized.toString());"
  );
}

// Persistence dependency
content = content.replace(
  "[companyId, cart, selectedCustomerId, orderDiscount, selectedCurrencyCode, paymentMethod]",
  "[companyId, cart, selectedCustomerId, orderDiscount, selectedCurrencyCode, paymentMethod, isFiscalized]"
);

// Process order payload
// Note: Using a unique part to match
content = content.replace(
    "discountAmount: item.discountAmount.toString(),",
    "discountAmount: item.discountAmount.toString(),\n                    isFiscalized: isFiscalized,"
);

fs.writeFileSync(filePath, content, "utf8");
console.log("Patched!");
