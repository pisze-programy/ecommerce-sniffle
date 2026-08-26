// Stock ids the reveal skips per provider.
// The shop does not sell these products, or the add fails.
// One entry per provider id.
export const EXCLUDED_STOCK_IDS: Readonly<Record<string, readonly number[]>> = {
  // Book packs (bundle). The add requires the pack components.
  osmpower: [
    516, 517, 518, 521, 525, 526, 546, 712, 756, 784, 790, 823, 824, 860, 875, 987, 1010, 1015, 1055, 1066, 1084, 1100,
    1124, 1127, 1136, 1175, 1205, 1214, 1240, 1269, 1275, 1301, 1314, 1338, 1344,
  ],
  // Empty variants, the shop does not sell them. The Etui (5054) has 1276 option combos.
  sklepskolim: [5054, 84, 154, 162, 6476, 6925, 6985],
  // Empty variants, the shop does not sell them.
  arustamian: [4439],
  // Dead products. The page id_product is 0, the refresh returns the category listing.
  phlov: [1038, 1041, 1046],
};
