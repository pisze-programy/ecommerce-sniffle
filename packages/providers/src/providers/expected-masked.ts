// Variants that stay masked on purpose per provider.
//
// A masked variant has no quantity. The executor and the worker raise a
// failure report for every masked variant. This finds a broken provider
// or a blocked product. The report is the point. Do not silence it.
//
// Some shops do not track the exact stock for a product. The product is
// buyable, but the shop sends no count. The provider writes no count on
// purpose. Guessing a one would invent data. The variant stays masked.
//
// These variants are known and explained. This list keeps them masked in
// the data but stops the daily failure report. A new masked variant is
// not on the list. It still reports. Review the new one by hand.
//
// Find the list again with this procedure:
//  1. Run the provider on a full catalog.
//  2. Collect every variant with quantity null.
//  3. Confirm the shop does not track the stock (for example an empty
//     max_qty or a missing stock level). A shop that tracks the stock
//     and sends no count is a broken provider. Fix it, do not list it.
//  4. Record the variant id here.
//
// Date: 2026-09-20. Verified by hand against the live shops.
export const EXPECTED_MASKED_VARIANT_IDS: Readonly<Record<string, readonly string[]>> = {
  // 28 variants. The shop does not track the exact stock.
  // 24 are variable products with an empty max_qty.
  // 4 are simple products (gumka, kokarda) with no stock level.
  rever: [
    '8010',
    '33937',
    '39683',
    '39689',
    '39740',
    '39741',
    '39800',
    '39804',
    '39907',
    '50570',
    '50575',
    '51066',
    '51067',
    '51595',
    '51596',
    '52793',
    '52795',
    '59121',
    '59231',
    '59638',
    '59641',
    '69336',
    '69337',
    '69514',
    '79989',
    '80174',
    '81953',
    '95439',
  ],
  // 1 variant. The product knitted-beanie-251a518 has no embedded
  // inventory script. The shop does not track the exact stock.
  misbhv: ['53573630099795'],
};
