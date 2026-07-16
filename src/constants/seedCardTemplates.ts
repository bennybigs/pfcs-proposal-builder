import type { CardTemplate } from '@/types';

export const SEED_CARD_TEMPLATES: CardTemplate[] = [
  {
    id: 'foundation',
    category: 'shell',
    title: 'Foundation',
    defaultContent: `Post-Frame Construction Solutions Foundation System — engineered precast concrete columns set in poured concrete footings below frost depth (minimum 4'-0" below building grade). Reinforced precast concrete columns connect to laminated wood columns via internal threaded adjustment bracket for precise alignment and long-term structural integrity. Treated wood splashboard system at base of all exterior walls.

**Concrete Floor:** [X]" reinforced concrete with [wire mesh / fiber mesh / rebar] — [X,XXX] sq ft total.

**Site Preparation:** Included — site grading, excavation, and base preparation within the building footprint.`,
    suggestedPriceRange: [15000, 45000],
  },
  {
    id: 'siding-wainscot',
    category: 'exterior',
    title: 'Siding & Wainscot',
    defaultContent: `**Wall Siding (all walls):** [siding product, e.g., Fluoroflex 1000 Hi-Rib Steel] — minimum .019 gauge steel, fastened with stainless steel screws. Color: [color name].

**Wainscot (all walls):** 36" tall [wainscot product] wainscot — minimum .019 gauge steel. Color: [wainscot color].`,
    suggestedPriceRange: [8000, 22000],
  },
  {
    id: 'roof',
    category: 'exterior',
    title: 'Roof',
    defaultContent: `**Roofing:** [roof product] — minimum .019 gauge steel, fastened with stainless steel screws, with Vent-A-Ridge. Color: [roof color].

**Pitch:** [X/12]

Filler strips added under ridgecap at peak. Roof structure has not been designed for installation of anything that could retain snow on the roof.`,
    suggestedPriceRange: [10000, 28000],
  },
  {
    id: 'overhangs-trim',
    category: 'exterior',
    title: 'Overhangs, Gutters & Trim',
    defaultContent: `**Sidewall Overhangs (E, W):** [X]' vented overhang with standard 6" fascia, 5" gutters, and 3"x4" downspouts with elbows at base.

**Endwall Overhangs (N, S):** [X]' non-vented overhang with 6" fascia.

**Fascia / Soffit Color:** [color]

**Trim Color:** [color]`,
    suggestedPriceRange: [3000, 8000],
  },
  {
    id: 'walk-doors',
    category: 'openings',
    title: 'Walk Doors',
    defaultContent: `**Quantity:** [X]

**Specification:** 3'x6'8" insulated walk door(s) with single-cylinder deadbolt and lockset.

**Location(s):** [Location]

**Color:** [color]`,
    suggestedPriceRange: [700, 4000],
  },
  {
    id: 'windows',
    category: 'openings',
    title: 'Windows',
    defaultContent: `**Quantity:** [X]

**Specification:** [Size] vinyl windows with low-E glass and argon fill.

**Grid Pattern:** [Grid / No Grid]

**Trim Color:** [color]`,
    suggestedPriceRange: [1500, 8000],
  },
  {
    id: 'overhead-doors',
    category: 'openings',
    title: 'Overhead Doors',
    defaultContent: `**Quantity:** [X]

**Size:** [Width]' x [Height]'

**Type:** [Insulated sectional / Carriage style / Roll-up]

**Color:** [color]

**Operator:** [Included / By owner]`,
    suggestedPriceRange: [2000, 12000],
  },
  {
    id: 'lq-framing-walls',
    category: 'living-quarters',
    title: 'Living Quarters — Framing & Walls',
    defaultContent: `**Framing:** 2x6 exterior walls, 2x4 interior partition walls — kiln-dried lumber, 16" o.c.

**Ceiling Height:** [9' / 10' / 12' / Vaulted to peak]

**Interior Drywall:** 1/2" gypsum board on walls and ceilings, taped and finished to Level 4 — paint-ready.

**Interior Doors:** [Quantity] — [style, e.g., 6-panel hollow core], [hardware finish]`,
    suggestedPriceRange: [20000, 60000],
  },
  {
    id: 'lq-insulation',
    category: 'living-quarters',
    title: 'Living Quarters — Insulation',
    defaultContent: `**Exterior Walls:** [Closed-cell spray foam R-21 / Fiberglass batt R-19 + housewrap]

**Ceiling / Attic:** [Blown-in fiberglass R-49 / Open-cell spray foam R-38]

**Vapor Retarder:** 4-mil vapor retarder behind interior wall finishes.`,
    suggestedPriceRange: [4000, 15000],
  },
  {
    id: 'lq-flooring',
    category: 'living-quarters',
    title: 'Living Quarters — Flooring (Allowance)',
    defaultContent: `Flooring allowance: **$[X.XX] per square foot installed** (material + labor). Owner selects from PFCS-approved supplier catalog. Options include LVP, engineered hardwood, tile, or carpet by area.`,
    suggestedPriceRange: [6000, 20000],
  },
  {
    id: 'lq-kitchen',
    category: 'living-quarters',
    title: 'Living Quarters — Kitchen',
    defaultContent: `**Cabinetry Allowance:** $[XX,XXX] — semi-custom from PFCS preferred supplier

**Countertop Allowance:** $[X,XXX] — [Quartz / Granite / Butcher Block]

**Sink & Faucet Allowance:** $[XXX]

**Appliances:** By owner unless specified — appliance installation included`,
    suggestedPriceRange: [18000, 45000],
  },
  {
    id: 'lq-bathrooms',
    category: 'living-quarters',
    title: 'Living Quarters — Bathrooms',
    defaultContent: `**Quantity:** [X] full bath(s), [X] half bath(s)

**Vanity Allowance:** $[X,XXX] per vanity

**Shower / Tub:** [Tile shower / Fiberglass surround / Freestanding tub] — see plans for locations

**Fixtures:** [Brand / Finish]`,
    suggestedPriceRange: [8000, 25000],
  },
  {
    id: 'lq-electrical',
    category: 'systems',
    title: 'Living Quarters — Electrical',
    defaultContent: `**Service:** [200 / 400] amp service with main panel — sized for living + shop loads.

**Outlets & Switches:** Per NEC code — standard decora style, color [White / Almond]

**Lighting Allowance:** $[X,XXX] — owner selects fixtures from approved supplier.

**Smoke / CO Detectors:** Code-required, hardwired with battery backup.

Generator hookup, EV charging, smart-home wiring, and audio/visual pre-wire are NOT included unless added as separate options.`,
    suggestedPriceRange: [12000, 25000],
  },
  {
    id: 'lq-plumbing',
    category: 'systems',
    title: 'Living Quarters — Plumbing',
    defaultContent: `**Water Source:** [Municipal / Well — by others]

**Septic / Sewer:** [Septic by others / Municipal sewer connection by others]

**Water Heater:** [50-gallon electric / Tankless gas / Heat pump water heater]

**Rough-In:** All living-area rough-in included; finish plumbing per fixtures listed above.`,
    suggestedPriceRange: [8000, 18000],
  },
  {
    id: 'lq-hvac',
    category: 'systems',
    title: 'Living Quarters — HVAC',
    defaultContent: `**System Type:** [Heat pump / Forced-air gas furnace + AC / Mini-split system]

**Sizing:** Per Manual J load calculation for living area

**Ductwork:** [Insulated flex / Sheet metal] — supply and return per Manual D

**Thermostat:** Programmable, [Smart / Standard]`,
    suggestedPriceRange: [10000, 22000],
  },
  {
    id: 'shop-area',
    category: 'shop',
    title: 'Shop / Garage Area',
    defaultContent: `Higher utility finish than typical living space. No interior drywall, fixtures, or HVAC unless specified below.

**Concrete Floor:** [X]" reinforced concrete slab with vapor barrier — broom finish, [X,XXX] sq ft.

**Floor Drain:** [Included / Not Included] — [Location]

**Interior Wall Finish:** Hi-Rib Steel (.019 White Polyester) from floor up to 8' height, fastened to nailers with painted steel screws. Wall cavity insulated with 6" fiberglass insulation, 4-mil vapor retarder.

**Ceiling Finish:** Hi-Rib Steel (.019 White CQ Polyester Solid) fastened to lower chord of truss.

**Lighting:** [X] LED high-bay fixtures, switched at main entry.

**Outlets:** [X] 120V duplex, [X] 240V, [X] 50-amp for welder/RV (if requested).

**Heating:** [Hanging gas unit heater / Radiant in-floor / None]`,
    suggestedPriceRange: [15000, 45000],
  },
  {
    id: 'energy-package',
    category: 'shop',
    title: 'Energy Performance Package',
    defaultContent: `Total insulated area: [X,XXX] sq ft.

**Ceiling:** Hi-Rib Steel finish with R-49 blown-in fiberglass insulation. **No cellulose under any circumstances.**

**Walls (LQ):** R-21 closed-cell spray foam

**Walls (Shop):** R-19 fiberglass batt

**Vapor Retarder:** 4-mil throughout`,
    suggestedPriceRange: [5000, 18000],
  },
  {
    id: 'porch',
    category: 'options',
    title: 'Porches & Outdoor Coverage',
    defaultContent: `**Porch Dimensions:** [X]' wide x [X]' long, [X/12] pitch

**Grade to Porch Frame:** [X]' [X]"

**Location:** [Wall side], starting [X]' from [reference]

**Ends:** [Start: open / enclosed] • [End: open / enclosed]

**Roof:** Matches main building — Hi-Rib steel

**Foundation:** PFCS Foundation System of concrete lower in ground with laminated wood column upper

**Gutters:** 5" gutters with 3"x4" downspouts`,
    suggestedPriceRange: [4000, 15000],
  },
  {
    id: 'includes-excludes',
    category: 'options',
    title: "What's Included & Excluded",
    defaultContent: `**This proposal includes:**
- Engineered post-frame structural shell
- Concrete foundation and floor slab as specified
- Complete site preparation within building footprint
- All exterior siding, wainscot, roofing, doors, and windows as specified
- Interior framing, drywall, and finish for living quarters as specified
- Kitchen and bath rough-in and finish per allowances
- Electrical, plumbing, HVAC by licensed Ohio subcontractors
- Insulation package as specified
- Permits required for PFCS scope of work
- One (1) year workmanship warranty on PFCS-installed work

**This proposal excludes** (unless explicitly listed above):
- Land purchase, surveying, and zoning approvals
- Site work outside building footprint (drives, landscaping, septic, well, utility runs)
- Furniture, appliances, fixture selections above allowances
- Custom millwork, built-ins, premium finishes above allowances
- Window treatments, security systems
- Property taxes, HOA fees, builder's risk insurance during construction`,
  },
  {
    id: 'custom',
    category: 'custom',
    title: 'Custom Section',
    defaultContent: `[Enter your custom content here. Supports **bold**, *italic*, lists, and other markdown.]`,
  },
];
