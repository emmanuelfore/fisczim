export type HsCodeSuggestion = {
  code: string;
  title: string;
  chapter: string;
  keywords: string[];
  note?: string;
};

const HS_SUGGESTIONS: HsCodeSuggestion[] = [
  { code: "0101", title: "Live horses, asses, mules and hinnies", chapter: "01 Live animals", keywords: ["horse", "donkey", "mule", "livestock", "animal"] },
  { code: "0201", title: "Meat of bovine animals, fresh or chilled", chapter: "02 Meat", keywords: ["beef", "meat", "cattle", "steak", "bovine"] },
  { code: "0207", title: "Meat and edible offal of poultry", chapter: "02 Meat", keywords: ["chicken", "poultry", "broiler", "turkey", "duck", "meat"] },
  { code: "0302", title: "Fish, fresh or chilled", chapter: "03 Fish", keywords: ["fish", "tilapia", "bream", "trout", "fresh fish"] },
  { code: "0401", title: "Milk and cream, not concentrated", chapter: "04 Dairy", keywords: ["milk", "cream", "dairy"] },
  { code: "0406", title: "Cheese and curd", chapter: "04 Dairy", keywords: ["cheese", "curd", "dairy"] },
  { code: "0701", title: "Potatoes, fresh or chilled", chapter: "07 Vegetables", keywords: ["potato", "vegetable", "fresh produce"] },
  { code: "0702", title: "Tomatoes, fresh or chilled", chapter: "07 Vegetables", keywords: ["tomato", "vegetable", "fresh produce"] },
  { code: "0703", title: "Onions, shallots, garlic, leeks", chapter: "07 Vegetables", keywords: ["onion", "garlic", "shallot", "leek", "vegetable"] },
  { code: "0803", title: "Bananas, including plantains", chapter: "08 Fruit", keywords: ["banana", "plantain", "fruit"] },
  { code: "0805", title: "Citrus fruit", chapter: "08 Fruit", keywords: ["orange", "lemon", "lime", "grapefruit", "citrus", "fruit"] },
  { code: "0901", title: "Coffee, whether or not roasted", chapter: "09 Coffee, tea, spices", keywords: ["coffee", "beans", "roasted coffee"] },
  { code: "0902", title: "Tea", chapter: "09 Coffee, tea, spices", keywords: ["tea", "black tea", "green tea"] },
  { code: "1001", title: "Wheat and meslin", chapter: "10 Cereals", keywords: ["wheat", "grain", "flour grain", "cereal"] },
  { code: "1005", title: "Maize (corn)", chapter: "10 Cereals", keywords: ["maize", "corn", "grain", "cereal"] },
  { code: "1101", title: "Wheat or meslin flour", chapter: "11 Milling products", keywords: ["flour", "wheat flour", "baking flour", "meal"] },
  { code: "1102", title: "Cereal flours other than wheat", chapter: "11 Milling products", keywords: ["maize meal", "mealie meal", "corn flour", "flour"] },
  { code: "1507", title: "Soya-bean oil and fractions", chapter: "15 Fats and oils", keywords: ["soybean oil", "soya oil", "cooking oil", "vegetable oil"] },
  { code: "1512", title: "Sunflower, safflower or cotton-seed oil", chapter: "15 Fats and oils", keywords: ["sunflower oil", "cooking oil", "vegetable oil", "cotton seed oil"] },
  { code: "1701", title: "Cane or beet sugar and chemically pure sucrose", chapter: "17 Sugar", keywords: ["sugar", "white sugar", "brown sugar", "cane sugar"] },
  { code: "1806", title: "Chocolate and other food preparations containing cocoa", chapter: "18 Cocoa", keywords: ["chocolate", "cocoa", "sweets", "candy"] },
  { code: "1902", title: "Pasta, whether or not cooked or stuffed", chapter: "19 Prepared cereals", keywords: ["pasta", "spaghetti", "macaroni", "noodles"] },
  { code: "1905", title: "Bread, pastry, cakes, biscuits and other bakers' wares", chapter: "19 Prepared cereals", keywords: ["bread", "cake", "biscuit", "cookie", "pastry", "bakery"] },
  { code: "2009", title: "Fruit or vegetable juices", chapter: "20 Prepared vegetables/fruit", keywords: ["juice", "fruit juice", "orange juice", "drink"] },
  { code: "2103", title: "Sauces and preparations therefor; mixed condiments", chapter: "21 Miscellaneous edible preparations", keywords: ["sauce", "tomato sauce", "ketchup", "condiment", "seasoning"] },
  { code: "2106", title: "Food preparations not elsewhere specified", chapter: "21 Miscellaneous edible preparations", keywords: ["food preparation", "supplement", "instant drink", "premix"] },
  { code: "2201", title: "Waters, including natural or artificial mineral waters", chapter: "22 Beverages", keywords: ["water", "bottled water", "mineral water"] },
  { code: "2202", title: "Waters with added sugar; non-alcoholic beverages", chapter: "22 Beverages", keywords: ["soft drink", "soda", "fizzy drink", "beverage", "cordial"] },
  { code: "2203", title: "Beer made from malt", chapter: "22 Beverages", keywords: ["beer", "lager", "malt beer"] },
  { code: "2204", title: "Wine of fresh grapes", chapter: "22 Beverages", keywords: ["wine", "grape wine"] },
  { code: "2402", title: "Cigars, cheroots, cigarillos and cigarettes", chapter: "24 Tobacco", keywords: ["cigarette", "cigar", "tobacco"] },
  { code: "2523", title: "Portland cement, aluminous cement, slag cement", chapter: "25 Mineral products", keywords: ["cement", "portland cement", "building cement"] },
  { code: "2710", title: "Petroleum oils, other than crude", chapter: "27 Mineral fuels", keywords: ["petrol", "diesel", "fuel", "paraffin", "oil", "lubricant"] },
  { code: "3004", title: "Medicaments in measured doses or retail packs", chapter: "30 Pharmaceutical products", keywords: ["medicine", "medication", "tablets", "capsules", "paracetamol", "antibiotic", "pharmacy", "drug"] },
  { code: "3005", title: "Wadding, gauze, bandages and similar articles", chapter: "30 Pharmaceutical products", keywords: ["bandage", "gauze", "medical dressing", "plaster"] },
  { code: "3303", title: "Perfumes and toilet waters", chapter: "33 Perfumery and cosmetics", keywords: ["perfume", "fragrance", "toilet water"] },
  { code: "3304", title: "Beauty or make-up preparations and skin care", chapter: "33 Perfumery and cosmetics", keywords: ["makeup", "cosmetics", "lotion", "skin cream", "beauty", "moisturizer"] },
  { code: "3305", title: "Preparations for use on the hair", chapter: "33 Perfumery and cosmetics", keywords: ["shampoo", "hair", "conditioner", "hair product"] },
  { code: "3401", title: "Soap; organic surface-active products", chapter: "34 Soap and cleaning", keywords: ["soap", "bar soap", "toilet soap", "detergent soap"] },
  { code: "3402", title: "Organic surface-active agents and washing preparations", chapter: "34 Soap and cleaning", keywords: ["detergent", "washing powder", "dishwashing liquid", "cleaner"] },
  { code: "3923", title: "Plastic articles for conveyance or packing", chapter: "39 Plastics", keywords: ["plastic bag", "packaging", "container", "plastic bottle", "crate"] },
  { code: "4011", title: "New pneumatic tyres, of rubber", chapter: "40 Rubber", keywords: ["tyre", "tire", "rubber tyre", "vehicle tyre"] },
  { code: "4202", title: "Trunks, suitcases, bags and similar containers", chapter: "42 Leather articles", keywords: ["bag", "handbag", "suitcase", "backpack", "wallet"] },
  { code: "4818", title: "Toilet paper and similar household paper", chapter: "48 Paper", keywords: ["toilet paper", "tissue", "napkin", "paper towel"] },
  { code: "4901", title: "Printed books, brochures and similar printed matter", chapter: "49 Printed matter", keywords: ["book", "brochure", "manual", "printed book"] },
  { code: "6109", title: "T-shirts, singlets and other vests, knitted or crocheted", chapter: "61 Apparel knitted", keywords: ["t-shirt", "shirt", "vest", "clothing", "apparel"] },
  { code: "6203", title: "Men's or boys' suits, jackets, trousers and shorts", chapter: "62 Apparel woven", keywords: ["trousers", "pants", "shorts", "suit", "jacket", "men clothing"] },
  { code: "6204", title: "Women's or girls' suits, dresses, skirts and trousers", chapter: "62 Apparel woven", keywords: ["dress", "skirt", "women clothing", "ladies clothing"] },
  { code: "6403", title: "Footwear with outer soles of rubber, plastics or leather", chapter: "64 Footwear", keywords: ["shoe", "footwear", "boots", "sneaker", "sandal"] },
  { code: "6810", title: "Articles of cement, concrete or artificial stone", chapter: "68 Stone/cement articles", keywords: ["brick", "concrete", "paver", "tile", "building block"] },
  { code: "7214", title: "Iron or non-alloy steel bars and rods", chapter: "72 Iron and steel", keywords: ["steel bar", "rebar", "iron bar", "rod"] },
  { code: "7308", title: "Structures and parts of structures, of iron or steel", chapter: "73 Iron/steel articles", keywords: ["steel structure", "roofing", "frame", "steel door", "steel window"] },
  { code: "8418", title: "Refrigerators, freezers and heat pumps", chapter: "84 Machinery", keywords: ["fridge", "refrigerator", "freezer", "chiller"] },
  { code: "8471", title: "Automatic data processing machines and units", chapter: "84 Machinery", keywords: ["computer", "laptop", "desktop", "server", "processor"] },
  { code: "8504", title: "Electrical transformers, static converters and inductors", chapter: "85 Electrical machinery", keywords: ["charger", "adapter", "transformer", "inverter", "power supply"] },
  { code: "8517", title: "Telephones and other apparatus for communication", chapter: "85 Electrical machinery", keywords: ["phone", "mobile phone", "smartphone", "router", "modem", "network"] },
  { code: "8528", title: "Monitors and projectors; television receivers", chapter: "85 Electrical machinery", keywords: ["tv", "television", "monitor", "projector", "screen"] },
  { code: "8703", title: "Motor cars and other motor vehicles", chapter: "87 Vehicles", keywords: ["car", "vehicle", "motor car", "sedan", "suv"] },
  { code: "8708", title: "Parts and accessories of motor vehicles", chapter: "87 Vehicles", keywords: ["car parts", "vehicle parts", "spares", "brake pads", "filter", "shock absorber"] },
  { code: "9403", title: "Other furniture and parts thereof", chapter: "94 Furniture", keywords: ["furniture", "chair", "table", "desk", "cabinet", "wardrobe"] },
  { code: "9503", title: "Tricycles, scooters, dolls and other toys", chapter: "95 Toys", keywords: ["toy", "doll", "scooter", "game", "children toy"] },
];

const normalise = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toEightDigitHsCode = (code: string) => code.replace(/\D/g, "").padEnd(8, "0").slice(0, 8);

export function findHsCodeSuggestions(query: string, limit = 6): HsCodeSuggestion[] {
  const q = normalise(query);
  if (!q) {
    return HS_SUGGESTIONS.slice(0, limit).map((item) => ({ ...item, code: toEightDigitHsCode(item.code) }));
  }

  const tokens = q.split(" ").filter(Boolean);
  const numericQuery = q.replace(/\D/g, "");

  return HS_SUGGESTIONS
    .map((item) => {
      const eightDigitCode = toEightDigitHsCode(item.code);
      const haystack = normalise([eightDigitCode, item.code, item.title, item.chapter, ...item.keywords].join(" "));
      const exactKeyword = item.keywords.some((keyword) => normalise(keyword) === q);
      const phrase = haystack.includes(q);
      const tokenHits = tokens.filter((token) => haystack.includes(token)).length;
      const codeHit = numericQuery ? eightDigitCode.startsWith(numericQuery) : false;
      const score = (exactKeyword ? 100 : 0) + (phrase ? 50 : 0) + tokenHits * 12 + (codeHit ? 35 : 0);
      return { item: { ...item, code: eightDigitCode }, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item);
}
