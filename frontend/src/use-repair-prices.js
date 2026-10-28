// React hook: the repair "from" prices, the defaults at first, then the Pricing Console's.
import { useEffect, useState } from "react";
import { REPAIRS_BY_DEVICE, loadRepairPrices } from "./repair-prices.js";

export default function useRepairPrices() {
  const [prices, setPrices] = useState(REPAIRS_BY_DEVICE);
  useEffect(() => { let on = true; loadRepairPrices().then((p) => { if (on) setPrices(p); }); return () => { on = false; }; }, []);
  return prices;
}
