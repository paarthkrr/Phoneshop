// iPhone 13–18 Pro Max photos are cropped from the shop's own flyer (public/photos/).
// Other sample photos (imageUrl) are free Pexels images (pexels.com/license) matched only
// where the photo's own title names that exact model. Replace any in the Pricing Console.
// ONE shared device catalogue for the quote calculator, Register (POS), and
// Pricing Console. Previously each kept its own copy and they drifted apart —
// the Register only knew 17 models while the calculator had 91.
export const DEFAULT_CATALOG = [
  { brand: "Apple", icon: "🍎", model: "iPhone 18 Pro Max", release: "2026-09-18", retail: { "256GB": 2299, "512GB": 2699 }, category: "phone", imageUrl: "/photos/iphone-18-pro-max.png" },
  { brand: "Apple", icon: "🍎", model: "iPhone 18 Pro", release: "2026-09-18", retail: { "256GB": 2099, "512GB": 2499 }, category: "phone", imageUrl: "/photos/real/iphone-18-pro.webp" },
  { brand: "Apple", icon: "🍎", model: "iPhone 17 Pro Max", release: "2025-09-19", retail: { "256GB": 2199, "512GB": 2599, "1TB": 2999, "2TB": 3799 }, category: "phone", marketAdjPct: 8, imageUrl: "/photos/iphone-17-pro-max.png" },
  { brand: "Apple", icon: "🍎", model: "iPhone 17 Pro", release: "2025-09-19", retail: { "256GB": 1999, "512GB": 2399, "1TB": 2799 }, category: "phone", marketAdjPct: 8 },
  { brand: "Apple", icon: "🍎", model: "iPhone 17", release: "2025-09-19", retail: { "256GB": 1399, "512GB": 1799 }, category: "phone", imageUrl: "/photos/real/iphone-17.webp" },
  { brand: "Apple", icon: "🍎", model: "iPhone 16 Pro Max", release: "2024-09-20", retail: { "256GB": 2149, "512GB": 2519, "1TB": 2899 }, category: "phone", imageUrl: "/photos/iphone-16-pro-max.png" },
  { brand: "Apple", icon: "🍎", model: "iPhone 16 Pro", release: "2024-09-20", retail: { "128GB": 1799, "256GB": 1999, "512GB": 2369, "1TB": 2749 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 16 Plus", release: "2024-09-20", retail: { "128GB": 1599, "256GB": 1799 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 16", release: "2024-09-20", retail: { "128GB": 1399, "256GB": 1649 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 15 Pro Max", release: "2023-09-22", retail: { "256GB": 2199, "512GB": 2569, "1TB": 2939 }, category: "phone", imageUrl: "/photos/iphone-15-pro-max.png" },
  { brand: "Apple", icon: "🍎", model: "iPhone 15 Pro", release: "2023-09-22", retail: { "128GB": 1849, "256GB": 2029, "512GB": 2399, "1TB": 2769 }, category: "phone", imageUrl: "https://images.pexels.com/photos/19060954/pexels-photo-19060954.jpeg?auto=compress&cs=tinysrgb&w=600" },
  { brand: "Apple", icon: "🍎", model: "iPhone 15 Plus", release: "2023-09-22", retail: { "128GB": 1649, "256GB": 1849 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 15", release: "2023-09-22", retail: { "128GB": 1499, "256GB": 1699, "512GB": 2099 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 14 Pro Max", release: "2022-09-16", retail: { "128GB": 1899, "256GB": 2069, "512GB": 2409, "1TB": 2779 }, category: "phone", imageUrl: "/photos/iphone-14-pro-max.png" },
  { brand: "Apple", icon: "🍎", model: "iPhone 14 Pro", release: "2022-09-16", retail: { "128GB": 1749, "256GB": 1919, "512GB": 2259, "1TB": 2629 }, category: "phone", imageUrl: "https://images.pexels.com/photos/13341771/pexels-photo-13341771.jpeg?auto=compress&cs=tinysrgb&w=600" },
  { brand: "Apple", icon: "🍎", model: "iPhone 14 Plus", release: "2022-09-16", retail: { "128GB": 1579, "256GB": 1749 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 14", release: "2022-09-16", retail: { "128GB": 1399, "256GB": 1569 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 13 Pro Max", release: "2021-09-24", retail: { "128GB": 1849, "256GB": 2019, "512GB": 2369, "1TB": 2719 }, category: "phone", imageUrl: "/photos/iphone-13-pro-max.png" },
  { brand: "Apple", icon: "🍎", model: "iPhone 13", release: "2021-09-24", retail: { "128GB": 1349, "256GB": 1519 }, category: "phone", imageUrl: "https://images.pexels.com/photos/14666032/pexels-photo-14666032.jpeg?auto=compress&cs=tinysrgb&w=600" },
  { brand: "Apple", icon: "🍎", model: "iPhone 12", release: "2020-10-23", retail: { "64GB": 1349, "128GB": 1429, "256GB": 1579 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone SE (2022)", release: "2022-03-18", retail: { "64GB": 719, "128GB": 789 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 11", release: "2019-09-20", retail: { "64GB": 1199, "128GB": 1279 }, category: "phone" },

  { brand: "Samsung", icon: "🔷", model: "Galaxy S26 Ultra", release: "2026-02-01", retail: { "256GB": 2199, "512GB": 2419 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S26+", release: "2026-02-01", retail: { "256GB": 1799, "512GB": 1999 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S26", release: "2026-02-01", retail: { "128GB": 1499, "256GB": 1599 }, category: "phone", imageUrl: "/photos/real/galaxy-s26.webp" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S25 Ultra", release: "2025-01-22", retail: { "256GB": 2049, "512GB": 2269 }, category: "phone", imageUrl: "https://images.pexels.com/photos/30466736/pexels-photo-30466736.jpeg?auto=compress&cs=tinysrgb&w=600" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S25", release: "2025-01-22", retail: { "128GB": 1399, "256GB": 1499 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S24 Ultra", release: "2024-01-24", retail: { "256GB": 1999, "512GB": 2199 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S24", release: "2024-01-24", retail: { "128GB": 1399 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S23 Ultra", release: "2023-02-17", retail: { "256GB": 1949 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S23", release: "2023-02-17", retail: { "128GB": 1499 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S22 Ultra", release: "2022-02-25", retail: { "256GB": 1849 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S22", release: "2022-02-25", retail: { "128GB": 1349 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Z Fold8 Ultra", release: "2026-08-14", retail: { "256GB": 2999, "512GB": 3299, "1TB": 3899 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Z Fold8", release: "2026-08-14", retail: { "256GB": 2699, "512GB": 2999, "1TB": 3599 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Z Flip8", release: "2026-08-14", retail: { "256GB": 1949, "512GB": 2249 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Z Fold7", release: "2025-07-25", retail: { "256GB": 2799, "512GB": 2999 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Z Fold6", release: "2024-07-24", retail: { "256GB": 2599 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Z Flip7", release: "2025-07-25", retail: { "256GB": 1799 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Z Flip6", release: "2024-07-24", retail: { "256GB": 1649 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Z Flip5", release: "2023-07-26", retail: { "256GB": 1499 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy A56", release: "2025-03-06", retail: { "128GB": 699, "256GB": 799 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy A17", release: "2025-09-01", retail: { "128GB": 399 }, category: "phone", imageUrl: "/photos/real/galaxy-a17.webp" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy A16", release: "2025-01-08", retail: { "128GB": 349 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy A55", release: "2024-03-11", retail: { "128GB": 699 }, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy A54", release: "2023-03-24", retail: { "128GB": 699 }, category: "phone" },

  { brand: "Google", icon: "🟡", model: "Pixel 10 Pro Fold", release: "2025-10-09", retail: { "256GB": 2699, "512GB": 2999 }, category: "phone", marketAdjPct: -20 },
  { brand: "Google", icon: "🟡", model: "Pixel 10 Pro XL", release: "2025-08-28", retail: { "256GB": 1799, "512GB": 1999, "1TB": 2299 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 10 Pro", release: "2025-08-28", retail: { "128GB": 1499, "256GB": 1699, "512GB": 1899 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 10", release: "2025-08-28", retail: { "128GB": 1199, "256GB": 1399 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 9a", release: "2025-04-10", retail: { "128GB": 849, "256GB": 949 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 9 Pro", release: "2024-08-22", retail: { "128GB": 1699, "256GB": 1849 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 9", release: "2024-08-22", retail: { "128GB": 1199 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 8 Pro", release: "2023-10-12", retail: { "128GB": 1299, "256GB": 1449 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 8", release: "2023-10-12", retail: { "128GB": 999 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 8a", release: "2024-05-14", retail: { "128GB": 749, "256GB": 849 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 7", release: "2022-10-13", retail: { "128GB": 999 }, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 6a", release: "2022-07-28", retail: { "128GB": 749 }, category: "phone" },

  { brand: "OnePlus", icon: "🔴", model: "OnePlus 13", release: "2025-01-07", retail: { "256GB": 1499 }, category: "phone" },
  { brand: "OnePlus", icon: "🔴", model: "OnePlus 12", release: "2024-01-23", retail: { "256GB": 1399 }, category: "phone" },
  { brand: "OnePlus", icon: "🔴", model: "OnePlus 11", release: "2023-02-07", retail: { "128GB": 1099 }, category: "phone" },

  { brand: "Xiaomi", icon: "🟠", model: "Xiaomi 14", release: "2023-10-26", retail: { "256GB": 1299 }, category: "phone" },
  { brand: "Xiaomi", icon: "🟠", model: "Redmi Note 13 Pro", release: "2024-01-04", retail: { "128GB": 499 }, category: "phone" },
  { brand: "Xiaomi", icon: "🟠", model: "Mi 11", release: "2021-02-08", retail: { "128GB": 999 }, category: "phone" },

  { brand: "Oppo", icon: "🟢", model: "Find X7 Ultra", release: "2024-03-01", retail: { "256GB": 1899 }, category: "phone" },
  { brand: "Oppo", icon: "🟢", model: "Reno 11", release: "2023-11-01", retail: { "256GB": 799 }, category: "phone" },

  { brand: "Vivo", icon: "🟣", model: "X100 Pro", release: "2023-12-01", retail: { "256GB": 1699 }, category: "phone" },
  { brand: "Vivo", icon: "🟣", model: "V29", release: "2023-08-01", retail: { "128GB": 799 }, category: "phone" },


  { brand: "Motorola", icon: "🔵", model: "Edge 50 Pro", release: "2024-04-25", retail: { "256GB": 999 }, category: "phone" },
  { brand: "Motorola", icon: "🔵", model: "Razr 50", release: "2024-07-25", retail: { "256GB": 1399 }, category: "phone" },


  { brand: "Nothing", icon: "🔘", model: "Nothing Phone (3)", release: "2025-07-04", retail: { "256GB": 999, "512GB": 1149 }, category: "phone", imageUrl: "/photos/real/nothing-phone-3.webp" },
  { brand: "Nothing", icon: "🔘", model: "Nothing Phone (3a) Pro", release: "2025-03-11", retail: { "128GB": 649 }, category: "phone" },
  { brand: "Nothing", icon: "🔘", model: "Nothing Phone (2a)", release: "2024-03-05", retail: { "128GB": 449 }, category: "phone" },

  { brand: "Apple", icon: "⌚", model: "Apple Watch Ultra 3", release: "2025-09-19", retail: { "49mm": 1099 }, category: "watch" },
  { brand: "Apple", icon: "⌚", model: "Apple Watch Series 11", release: "2025-09-19", retail: { "42mm": 429, "46mm": 459 }, category: "watch" },
  { brand: "Apple", icon: "⌚", model: "Apple Watch SE 3", release: "2025-09-19", retail: { "40mm": 329, "44mm": 359 }, category: "watch" },
  { brand: "Samsung", icon: "⌚", model: "Galaxy Watch Ultra 2", release: "2026-08-14", retail: { "47mm": 949 }, category: "watch" },
  { brand: "Samsung", icon: "⌚", model: "Galaxy Watch9", release: "2026-08-14", retail: { "BT": 649, "LTE": 749 }, category: "watch" },
  { brand: "Samsung", icon: "⌚", model: "Galaxy Watch7", release: "2024-07-24", retail: { "40mm": 499, "44mm": 549 }, category: "watch" },

  { brand: "Apple", icon: "📱", model: "iPad Pro 13 (M4)", release: "2024-05-15", retail: { "256GB": 2199, "512GB": 2499 }, category: "tablet" },
  { brand: "Apple", icon: "📱", model: "iPad Pro 11 (M4)", release: "2024-05-15", retail: { "256GB": 1699, "512GB": 1999 }, category: "tablet" },
  { brand: "Apple", icon: "📱", model: "iPad Air 13 (M3)", release: "2025-03-12", retail: { "128GB": 1299, "256GB": 1449 }, category: "tablet" },
  { brand: "Apple", icon: "📱", model: "iPad Air 11 (M3)", release: "2025-03-12", retail: { "128GB": 999, "256GB": 1149 }, category: "tablet" },
  { brand: "Apple", icon: "📱", model: "iPad mini (A17 Pro)", release: "2024-10-23", retail: { "128GB": 839, "256GB": 999 }, category: "tablet" },
  { brand: "Apple", icon: "📱", model: "iPad (11th gen, A16)", release: "2025-03-12", retail: { "128GB": 749, "256GB": 899 }, category: "tablet" },
  { brand: "Samsung", icon: "📱", model: "Galaxy Tab S10 Ultra", release: "2024-09-25", retail: { "256GB": 2199 }, category: "tablet" },
  { brand: "Samsung", icon: "📱", model: "Galaxy Tab A9+", release: "2023-10-17", retail: { "64GB": 399 }, category: "tablet" },

  { brand: "Apple", icon: "💻", model: "MacBook Pro 14 (M4)", release: "2024-11-08", retail: { "512GB": 3199 }, category: "laptop" },
  { brand: "Apple", icon: "💻", model: "MacBook Air 15 (M4)", release: "2025-03-12", retail: { "256GB": 2399 }, category: "laptop" },
  { brand: "Apple", icon: "💻", model: "MacBook Air 13 (M4)", release: "2025-03-12", retail: { "256GB": 2099 }, category: "laptop" },
  { brand: "Apple", icon: "💻", model: "MacBook Neo", release: "2026-06-01", retail: { "256GB": 1049 }, category: "laptop" },
  // ---- Added 30 Sep 2026: common Australian models (AU launch RRP; verify with the market-check tracker) ----
  { brand: "Apple", icon: "🍎", model: "iPhone Air", release: "2025-09-19", retail: { "256GB": 1799, "512GB": 2199, "1TB": 2599 }, category: "phone", imageUrl: "/photos/real/iphone-air.webp" },
  { brand: "Apple", icon: "🍎", model: "iPhone 16e", release: "2025-02-28", retail: {"128GB":  999, "256GB":  1199, "512GB":  1549}, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 13 Pro", release: "2021-09-24", retail: { "128GB": 1699, "256GB": 1869, "512GB": 2219, "1TB": 2569 }, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 13 mini", release: "2021-09-24", retail: {"128GB":  1199, "256GB":  1369}, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 12 Pro Max", release: "2020-11-13", retail: {"128GB":  1849, "256GB":  2019}, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 12 Pro", release: "2020-10-23", retail: {"128GB":  1699, "256GB":  1869}, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 12 mini", release: "2020-11-13", retail: {"64GB":  1199, "128GB":  1279}, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 11 Pro Max", release: "2019-09-20", retail: {"64GB":  1899, "256GB":  2149}, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone 11 Pro", release: "2019-09-20", retail: {"64GB":  1749, "256GB":  1999}, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone SE (2020)", release: "2020-04-24", retail: {"64GB":  749, "128GB":  829}, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPhone XR", release: "2018-10-26", retail: {"64GB":  1229, "128GB":  1299}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S25+", release: "2025-02-07", retail: {"256GB":  1849, "512GB":  2049}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S25 Edge", release: "2025-05-30", retail: {"256GB":  1849, "512GB":  2049}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S25 FE", release: "2025-09-19", retail: {"128GB":  1099, "256GB":  1199}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S24+", release: "2024-01-31", retail: {"256GB":  1849, "512GB":  2049}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S24 FE", release: "2024-10-03", retail: {"128GB":  1099, "256GB":  1199}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S23+", release: "2023-02-17", retail: {"256GB":  1849, "512GB":  2049}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S23 FE", release: "2023-10-26", retail: {"128GB":  999}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S22+", release: "2022-02-25", retail: {"128GB":  1549, "256GB":  1649}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S21 Ultra", release: "2021-01-29", retail: {"256GB":  1849, "512GB":  2049}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S21", release: "2021-01-29", retail: {"128GB":  1249, "256GB":  1349}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy S21 FE", release: "2022-01-11", retail: {"128GB":  999}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Z Fold5", release: "2023-08-11", retail: {"256GB":  2599, "512GB":  2799}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Z Fold4", release: "2022-08-26", retail: {"256GB":  2499, "512GB":  2699}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Z Flip4", release: "2022-08-26", retail: {"128GB":  1499, "256GB":  1599}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy A36", release: "2025-03-14", retail: {"128GB":  599, "256GB":  699}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy A26", release: "2025-03-28", retail: {"128GB":  449}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy A35", release: "2024-03-15", retail: {"128GB":  599}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy A25", release: "2024-01-24", retail: {"128GB":  449}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy A15", release: "2024-01-24", retail: {"128GB":  349}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy A34", release: "2023-03-24", retail: {"128GB":  549}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy A14", release: "2023-02-01", retail: {"64GB":  299}, category: "phone" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy A06", release: "2024-09-01", retail: {"64GB":  199}, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 9 Pro XL", release: "2024-08-22", retail: {"128GB":  1849, "256GB":  2049}, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 9 Pro Fold", release: "2024-09-04", retail: {"256GB":  2699}, category: "phone", marketAdjPct: -20 },
  { brand: "Google", icon: "🟡", model: "Pixel 7a", release: "2023-05-11", retail: {"128GB":  749}, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 7 Pro", release: "2022-10-13", retail: {"128GB":  1299, "256GB":  1449}, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 6 Pro", release: "2021-10-28", retail: {"128GB":  1299}, category: "phone" },
  { brand: "Google", icon: "🟡", model: "Pixel 6", release: "2021-10-28", retail: {"128GB":  999}, category: "phone" },
  { brand: "Oppo", icon: "🟢", model: "Find X8 Pro", release: "2024-11-28", retail: {"512GB":  1999}, category: "phone" },
  { brand: "Oppo", icon: "🟢", model: "Find X8", release: "2024-11-28", retail: {"512GB":  1499}, category: "phone" },
  { brand: "Oppo", icon: "🟢", model: "Reno14 5G", release: "2025-07-15", retail: {"512GB":  899}, category: "phone" },
  { brand: "Oppo", icon: "🟢", model: "Reno13 5G", release: "2025-02-20", retail: {"512GB":  899}, category: "phone" },
  { brand: "Oppo", icon: "🟢", model: "Reno12 5G", release: "2024-07-10", retail: {"512GB":  799}, category: "phone" },
  { brand: "Oppo", icon: "🟢", model: "A5 Pro 5G", release: "2025-03-01", retail: {"256GB":  499}, category: "phone" },
  { brand: "Oppo", icon: "🟢", model: "A79 5G", release: "2023-11-01", retail: {"128GB":  399}, category: "phone" },
  { brand: "Oppo", icon: "🟢", model: "A60", release: "2024-05-01", retail: {"128GB":  299}, category: "phone" },
  { brand: "Motorola", icon: "🔵", model: "Edge 60 Pro", release: "2025-05-01", retail: {"512GB":  899}, category: "phone" },
  { brand: "Motorola", icon: "🔵", model: "Edge 50 Fusion", release: "2024-06-01", retail: {"256GB":  599}, category: "phone" },
  { brand: "Motorola", icon: "🔵", model: "Moto G85", release: "2024-08-01", retail: {"256GB":  499}, category: "phone" },
  { brand: "Motorola", icon: "🔵", model: "Moto G75 5G", release: "2024-11-01", retail: {"256GB":  499}, category: "phone" },
  { brand: "Motorola", icon: "🔵", model: "Moto G55 5G", release: "2024-09-01", retail: {"256GB":  399}, category: "phone" },
  { brand: "Motorola", icon: "🔵", model: "Moto G35 5G", release: "2024-12-01", retail: {"128GB":  299}, category: "phone" },
  { brand: "Motorola", icon: "🔵", model: "Moto G05", release: "2025-01-15", retail: {"128GB":  199}, category: "phone" },
  { brand: "Xiaomi", icon: "🟠", model: "Xiaomi 15", release: "2025-03-10", retail: {"512GB":  1399}, category: "phone" },
  { brand: "Xiaomi", icon: "🟠", model: "Redmi Note 14 Pro 5G", release: "2025-01-20", retail: {"256GB":  599}, category: "phone" },
  { brand: "Xiaomi", icon: "🟠", model: "Redmi Note 14", release: "2025-01-20", retail: {"128GB":  299}, category: "phone" },
  { brand: "Nothing", icon: "🔘", model: "Phone (3a)", release: "2025-03-11", retail: {"256GB":  599}, category: "phone" },
  { brand: "Apple", icon: "🍎", model: "iPad Air 11 (M2)", release: "2024-05-15", retail: {"128GB":  999}, category: "tablet" },
  { brand: "Apple", icon: "🍎", model: "iPad (10th gen)", release: "2022-10-26", retail: {"64GB":  749}, category: "tablet" },
  { brand: "Samsung", icon: "🔷", model: "Galaxy Tab S9 FE", release: "2023-10-12", retail: {"128GB":  699}, category: "tablet" },
  { brand: "Apple", icon: "🍎", model: "Apple Watch Series 10", release: "2024-09-20", retail: {"42mm":  649, "46mm":  699}, category: "watch" },
];

// Adds any models from the built-in list that a saved (staff-edited)
// catalogue doesn't have yet, WITHOUT touching models staff already edited.
// So new phones appear everywhere after an update, and custom prices survive.
// Earlier built-in prices that were wrong (Oct 2026 audit against Apple AU).
// A saved catalogue that still holds exactly one of these is corrected; any
// price staff typed themselves is left alone.
const RETAIL_CORRECTIONS = {
  "iPhone 17 Pro Max": { "256GB": 2199, "512GB": 2549 },
  "iPhone 17 Pro": { "128GB": 1999, "256GB": 2199 },
  "iPhone Air": { "256GB": 1799, "512GB": 2149, "1TB": 2499 },
  "iPhone 16 Pro Max": { "256GB": 2149, "512GB": 2519 },
  "iPhone 16 Pro": { "128GB": 1799, "256GB": 1999 },
  "iPhone 15 Pro": { "128GB": 1849, "256GB": 2049 },
  "iPhone 14 Pro Max": { "128GB": 1899, "256GB": 2069, "512GB": 2409 },
  "iPhone 14 Pro": { "128GB": 1749, "256GB": 1919, "512GB": 2259 },
  "iPhone 13 Pro Max": { "128GB": 1849, "256GB": 2019 },
  "iPhone 13 Pro": { "128GB": 1699, "256GB": 1869, "512GB": 2219 },
};
const sameRetail = (a, b) => { const ka = Object.keys(a || {}), kb = Object.keys(b || {}); return ka.length === kb.length && ka.every((k) => a[k] === b[k]); };
export function mergeCatalog(saved) {
  if (!Array.isArray(saved) || saved.length === 0) return DEFAULT_CATALOG;
  const key = (d) => `${d.brand}|${d.model}`.toLowerCase();
  const have = new Set(saved.map(key));
  const defaults = Object.fromEntries(DEFAULT_CATALOG.map((d) => [key(d), d]));
  // Fill in a built-in sample photo only where staff haven't set their own.
  const withPhotos = saved.map((d) => {
    const def = defaults[key(d)]; if (!def) return d;
    let out = d;
    if (!d.imageUrl && def.imageUrl) out = { ...out, imageUrl: def.imageUrl };          // built-in sample photo
    if (d.model !== def.model) out = { ...out, model: def.model };                       // tidy capitalisation, e.g. "moto g85" -> "Moto G85"
    if (out.marketAdjPct == null && def.marketAdjPct != null) out = { ...out, marketAdjPct: def.marketAdjPct };  // built-in market correction unless staff set their own
    const wrong = RETAIL_CORRECTIONS[def.model];
    if (wrong && sameRetail(out.retail, wrong)) out = { ...out, retail: { ...def.retail } };  // untouched old default -> corrected prices
    else if (out.retail && def.retail) {                                                  // add storage sizes (e.g. 1TB/2TB) staff don't have yet
      const missing = Object.keys(def.retail).filter((k) => !(k in out.retail));
      if (missing.length) out = { ...out, retail: { ...out.retail, ...Object.fromEntries(missing.map((k) => [k, def.retail[k]])) } };
    }
    return out;
  });
  return [...withPhotos, ...DEFAULT_CATALOG.filter((d) => !have.has(key(d)))];
}
