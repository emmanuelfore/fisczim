const fs = require('fs');
const path = 'c:/Users/Emmanuel/Documents/PROJECTS/fisczim/client/src/pages/pos.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add isFiscalized state
content = content.replace(
    /const \[isFullscreen, setIsFullscreen\] = useState\(false\);/,
    'const [isFullscreen, setIsFullscreen] = useState(false);\n    const [isFiscalized, setIsFiscalized] = useState(true);'
);

// 2. Add isFiscalized to persistence load
content = content.replace(
    /if \(savedPaymentMethod\) setPaymentMethod\(savedPaymentMethod\);/,
    'if (savedPaymentMethod) setPaymentMethod(savedPaymentMethod);\n            const savedFiscalized = localStorage.getItem(`${prefix}isFiscalized`);\n            if (savedFiscalized !== null) setIsFiscalized(savedFiscalized === "true");'
);

// 3. Add isFiscalized to persistence save
content = content.replace(
    /localStorage\.setItem\(`${prefix}paymentMethod`, paymentMethod\);/,
    'localStorage.setItem(`${prefix}paymentMethod`, paymentMethod);\n        localStorage.setItem(`${prefix}isFiscalized`, isFiscalized.toString());'
);

// 4. Update useEffect dependency array for persistence
content = content.replace(
    /\[companyId, cart, selectedCustomerId, orderDiscount, selectedCurrencyCode, paymentMethod\]\);/,
    '[companyId, cart, selectedCustomerId, orderDiscount, selectedCurrencyCode, paymentMethod, isFiscalized]);'
);

// 5. Add isFiscalized to clear session
content = content.replace(
    /localStorage\.removeItem\(`${prefix}paymentMethod`\);/,
    'localStorage.removeItem(`${prefix}paymentMethod`);\n        localStorage.removeItem(`${prefix}isFiscalized`);'
);

// 6. Update processOrder payload (online)
content = content.replace(
    /taxTypeId: item.taxTypeId\n                }\)\)\n            };/,
    'taxTypeId: item.taxTypeId\n                })),\n                isFiscalized: isFiscalized\n            };'
);

// 7. Update processOrder payload (offline/error)
content = content.replace(
    /taxTypeId: item.taxTypeId\n                        }\)\)\n                    };/,
    'taxTypeId: item.taxTypeId\n                        })),\n                        isFiscalized: isFiscalized\n                    };'
);

fs.writeFileSync(path, content, 'utf8');
console.log('Successfully patched pos.tsx');
