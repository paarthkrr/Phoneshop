// "Repair at my door": travel-fee zones, express surcharge and booking slots.
// Prices follow the market check (Sydney rivals such as Fix2u advertise no call-out fee,
// so ours is credited toward the repair: customers who go ahead pay nothing extra,
// and no-shows are covered).

export const DOORSTEP = {
  creditNote: "Travel fee is taken off your repair price if you go ahead.",
  zones: {
    A: { label: "Inner zone", km: "within about 10 km of Sydney CBD, Blacktown or Macquarie Park", fee: 15 },
    B: { label: "Outer zone", km: "about 10–15 km from those hubs", fee: 30 },
  },
  expressExtra: 30,           // technician on the way within about 2 hours
  windows: [
    { id: "am", label: "Morning", range: "9am – 12pm", start: 9, end: 12 },
    { id: "mid", label: "Afternoon", range: "12pm – 3pm", start: 12, end: 15 },
    { id: "pm", label: "Late afternoon", range: "3pm – 6pm", start: 15, end: 18 },
  ],
  cutoffHour: 17,             // last same-day express booking
};

// Postcodes sorted into zones by hand (approximate). Anything else is "ask first":
// we confirm the area and fee by message before anyone drives out.
const ZONE_A = ("2000 2007 2008 2009 2010 2011 2015 2016 2017 2018 2019 2020 2021 2022 2023 2024 2025 2026 2027 2028 2029 2030 2031 2032 2033 2034 2035 2036 2037 2038 2039 2040 2041 2042 2043 2044 2045 2046 2047 2048 2049 2050 2060 2061 2062 2063 2064 2065 2066 2067 2068 2069 2112 2113 2114 2122 2121 2120 2147 2148 2145 2767 2763").split(" ");
const ZONE_B = ("2006 2012 2013 2014 2086 2087 2088 2089 2090 2092 2093 2094 2095 2096 2097 2099 2100 2101 2102 2103 2104 2105 2106 2107 2108 2070 2071 2072 2073 2074 2075 2076 2077 2111 2115 2116 2117 2118 2119 2123 2124 2125 2126 2127 2128 2129 2130 2131 2132 2133 2134 2135 2136 2137 2138 2139 2140 2141 2142 2143 2144 2146 2150 2151 2152 2153 2154 2155 2160 2161 2162 2163 2164 2165 2166 2190 2191 2192 2193 2194 2195 2196 2197 2198 2199 2200 2203 2204 2205 2206 2207 2208 2209 2210 2211 2212 2213 2214 2216 2217 2218 2219 2220 2221 2222 2223 2224 2225 2226 2227 2228 2229 2230 2231 2232 2233 2234 2564 2762 2764 2765 2766 2768 2769 2770").split(" ");

export function zoneForPostcode(pc) {
  const p = String(pc || "").trim();
  if (!/^\d{4}$/.test(p)) return null;
  if (ZONE_A.includes(p)) return "A";
  if (ZONE_B.includes(p)) return "B";
  return "ask";
}

export function doorstepFee(zone, express) {
  if (zone !== "A" && zone !== "B") return null;
  return DOORSTEP.zones[zone].fee + (express ? DOORSTEP.expressExtra : 0);
}

const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Next 7 days of bookable slots. Today only offers windows that start after now + 90 minutes.
export function slotDays(now = new Date()) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const open = DOORSTEP.windows.filter((w) => {
      if (i > 0) return true;
      const startMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), w.start).getTime();
      return startMs >= now.getTime() + 90 * 60 * 1000;
    });
    days.push({ date: ymd(d), label: d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }), windows: open });
  }
  return days;
}

export function expressAvailable(now = new Date()) {
  const h = now.getHours() + now.getMinutes() / 60;
  return h >= 9 && h < DOORSTEP.cutoffHour;
}
