export interface ProductClassification {
  category: string;
  hsCode: string;
  isZeroRated: boolean;
}

const classificationRules = [
  // Books & Stationery
  { regex: /book|pen|pencil|paper|ruler|eraser|quire|pgs|pages|counter/i, category: "Stationery", hsCode: "48202000" },
  // Soft Drinks / Beverages
  { regex: /coke|7up|pepsi|sprite|fanta|fizzi|juice|citro|minute maid|drink|amasip/i, category: "Beverages - Non-Alcoholic", hsCode: "22021000" },
  // Mineral Water
  { regex: /water|acquaclear/i, category: "Beverages - Non-Alcoholic", hsCode: "22011000" },
  // Alcoholic Beverages
  { regex: /wine|whisky|gin|brandy|beer|stout|cider|brutal fruit|4th street|amarula|black label/i, category: "Beverages - Alcoholic", hsCode: "22089000" },
  // Toiletries & Cosmetics
  { regex: /lotion|cream|hair|soap|colgate|tooth|pad|tissue|roll on|spray|axe|dax/i, category: "Toiletries & Cosmetics", hsCode: "33049900" },
  // Cleaning & Detergents
  { regex: /dishwasher|harpic|jik|aloha|maq|boom|cleaner|polish|scourer/i, category: "Cleaning & Detergents", hsCode: "34022000" },
  // Snacks, Biscuits, Sweets
  { regex: /biscuit|cookie|cream|pop|candy|sweet|gum|sherbet|cornado|choc|toffee/i, category: "Snacks & Sweets", hsCode: "19059000" },
  // Groceries (Oils, Sugar, Flour, Mealie Meal, Pasta)
  { regex: /oil/i, category: "Groceries - Staples", hsCode: "15121900", isZeroRated: true },
  { regex: /sugar/i, category: "Groceries - Staples", hsCode: "17019900", isZeroRated: true },
  { regex: /flour/i, category: "Groceries - Staples", hsCode: "11010000", isZeroRated: true },
  { regex: /mealie meal|maize/i, category: "Groceries - Staples", hsCode: "11022000", isZeroRated: true },
  { regex: /macaroni|spaghetti|noodles/i, category: "Groceries - Pasta", hsCode: "19021900" },
  { regex: /chunks/i, category: "Groceries - Proteins", hsCode: "21069090", isZeroRated: true },
  { regex: /matemba|kapenta/i, category: "Groceries - Proteins", hsCode: "03055900", isZeroRated: true },
  { regex: /soup|usavi|spice|curry|sauce|salt/i, category: "Groceries - Condiments", hsCode: "21039000" },
  // Fruits & Veggies
  { regex: /apple/i, category: "Fruits & Vegetables", hsCode: "08081000", isZeroRated: true },
  { regex: /lemon/i, category: "Fruits & Vegetables", hsCode: "08055000", isZeroRated: true },
  { regex: /tomato/i, category: "Fruits & Vegetables", hsCode: "07020000", isZeroRated: true },
  { regex: /banana/i, category: "Fruits & Vegetables", hsCode: "08039000", isZeroRated: true },
  { regex: /yeast|baking powder/i, category: "Baking Supplies", hsCode: "21021000" },
  { regex: /match/i, category: "Hardware & Misc", hsCode: "36050000" },
  { regex: /razor|blade/i, category: "Hardware & Misc", hsCode: "82121000" },
  { regex: /needle/i, category: "Hardware & Misc", hsCode: "73199000" },
];

const zeroRatedFallbackKeywords = [
  /sugar/i, /oil/i, /mealie/i, /flour/i, /rice/i, /maize/i, /salt/i,
  /meat/i, /beef/i, /chicken/i, /fish/i, /matemba/i, /kapenta/i, /chunks/i, /eggs/i,
  /apple/i, /banana/i, /tomato/i, /onion/i, /lemon/i, /potato/i, /cabbage/i,
  /milk/i, /chimombe/i
];

export function classifyProduct(productName: string): ProductClassification {
  let matchedCategory = "General Groceries";
  let matchedHsCode = "21069090"; // Default food prep code
  let isZeroRated = false;

  if (!productName) {
    return { category: matchedCategory, hsCode: matchedHsCode, isZeroRated };
  }

  // 1. Check specific rules
  for (const rule of classificationRules) {
    if (rule.regex.test(productName)) {
      matchedCategory = rule.category;
      matchedHsCode = rule.hsCode;
      isZeroRated = rule.isZeroRated || false;
      break;
    }
  }

  // 2. Fallback check for zero-rated commodities if not already matched
  if (!isZeroRated) {
    for (const regex of zeroRatedFallbackKeywords) {
      if (regex.test(productName)) {
        isZeroRated = true;
        break;
      }
    }
  }

  return {
    category: matchedCategory,
    hsCode: matchedHsCode,
    isZeroRated
  };
}
