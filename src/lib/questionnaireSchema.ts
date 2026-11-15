import {
  PriorityPresetId,
  PriorityVectorRaw,
  QuestionnaireDraft,
  QuestionnaireStageKey,
} from '../types/questionnaire';

export const QUESTIONNAIRE_SCHEMA_VERSION = 1 as const;

export interface QuestionSectionMeta {
  key: QuestionnaireStageKey;
  label: string;
  shortLabel: string;
}

export const QUESTION_SECTIONS: QuestionSectionMeta[] = [
  { key: 'field', label: 'Field & Location', shortLabel: 'Field' },
  { key: 'soil', label: 'Land & Soil', shortLabel: 'Land & Soil' },
  { key: 'water', label: 'Water', shortLabel: 'Water' },
  { key: 'history', label: 'Crop History', shortLabel: 'Crop History' },
  { key: 'planning', label: 'Planning', shortLabel: 'Planning' },
  { key: 'constraints', label: 'Constraints & Practice', shortLabel: 'Constraints' },
  { key: 'priorities', label: 'Priorities & Yield', shortLabel: 'Priorities' },
  { key: 'review', label: 'Review & Consent', shortLabel: 'Review' },
];

export interface QuestionOption {
  value: string;
  label: string;
  description?: string;
}

export interface QuestionDefinition {
  id: string;
  version: number;
  section: QuestionnaireStageKey;
  sectionLabel: string;
  title: string;
  farmerQuestion: string;
  explanation: string;
  whyWeAsk: string;
  required: boolean;
  allowsUnknown: boolean;
  unknownLabel?: string;
  controlType:
    | 'simple_entry_choice'
    | 'simple_name_location'
    | 'simple_field_location'
    | 'simple_recent_crops'
    | 'simple_water'
    | 'mode_select'
    | 'farm_select'
    | 'field_select'
    | 'short_text'
    | 'single_select'
    | 'multi_select'
    | 'location_picker'
    | 'boundary_polygon'
    | 'area_unit'
    | 'timezone_select'
    | 'soil_texture'
    | 'soil_ph'
    | 'soil_ec'
    | 'soil_organic'
    | 'soil_nutrients'
    | 'soil_limitations'
    | 'water_limit'
    | 'irrigation_routine'
    | 'irrigation_amount'
    | 'water_quality'
    | 'crop_history'
    | 'fallow_cover'
    | 'current_crop'
    | 'pest_disease'
    | 'planning_horizon'
    | 'crops_per_year'
    | 'planting_windows'
    | 'crop_multiselect'
    | 'fertilizer_detail'
    | 'priority_preset'
    | 'priority_sliders'
    | 'yield_history'
    | 'review';
  options?: QuestionOption[];
  visibleWhen?: (draft: QuestionnaireDraft) => boolean;
  dependsOn?: string[];
  invalidatesDownstream?: string[];
}

export const PRIORITY_PRESET_VECTORS: Record<
  Exclude<PriorityPresetId, 'custom'>,
  {
    label: string;
    description: string;
    vector: Omit<PriorityVectorRaw, 'presetId'>;
    version: string;
  }
> = {
  save_water: {
    label: 'Save water',
    description: 'Lower water use and favour drought tolerance.',
    version: 'preset-v1.0',
    vector: {
      waterEfficiency: 85,
      soilImprovement: 45,
      climateResilience: 65,
      cropSuitability: 50,
      productivityPotential: 30,
    },
  },
  rebuild_soil: {
    label: 'Rebuild and protect soil',
    description: 'Favour legumes, cover crops, and soil organic matter.',
    version: 'preset-v1.0',
    vector: {
      waterEfficiency: 45,
      soilImprovement: 90,
      climateResilience: 55,
      cropSuitability: 55,
      productivityPotential: 35,
    },
  },
  handle_weather: {
    label: 'Handle difficult weather',
    description: 'Prioritise heat, frost, and dry-year stability.',
    version: 'preset-v1.0',
    vector: {
      waterEfficiency: 65,
      soilImprovement: 55,
      climateResilience: 90,
      cropSuitability: 60,
      productivityPotential: 35,
    },
  },
  balanced: {
    label: 'Balanced farm plan',
    description: 'Balanced mix of soil, water, resilience, and yield.',
    version: 'preset-v1.0',
    vector: {
      waterEfficiency: 60,
      soilImprovement: 65,
      climateResilience: 55,
      cropSuitability: 60,
      productivityPotential: 60,
    },
  },
  prioritise_suitability: {
    label: 'Prioritise crop suitability',
    description: 'Stick closely to local climate and soil fit.',
    version: 'preset-v1.0',
    vector: {
      waterEfficiency: 50,
      soilImprovement: 50,
      climateResilience: 55,
      cropSuitability: 90,
      productivityPotential: 45,
    },
  },
  prioritise_productivity: {
    label: 'Prioritise productivity potential',
    description: 'Focus on higher grain and cash-crop output.',
    version: 'preset-v1.0',
    vector: {
      waterEfficiency: 35,
      soilImprovement: 40,
      climateResilience: 45,
      cropSuitability: 60,
      productivityPotential: 90,
    },
  },
};

export function getAnswerValue<T = unknown>(
  draft: QuestionnaireDraft,
  questionId: string
): T | undefined {
  return draft.answers[questionId]?.value as T | undefined;
}

function hasIrrigationAccess(draft: QuestionnaireDraft): boolean {
  const q17 = getAnswerValue<string>(draft, 'Q17');
  return q17 === 'irrigation_only' || q17 === 'both';
}

function hasSoilTestResults(draft: QuestionnaireDraft): boolean {
  const q10 = getAnswerValue<string>(draft, 'Q10');
  return q10 === 'yes_full' || q10 === 'yes_partial';
}

function usesFertilisersOrAmendments(draft: QuestionnaireDraft): boolean {
  const q34 = getAnswerValue<string[]>(draft, 'Q34');
  if (!Array.isArray(q34)) return false;
  return (
    q34.includes('synthetic_fertilizer') ||
    q34.includes('organic_nutrient_inputs') ||
    q34.includes('compost_or_manure') ||
    q34.includes('green_manure')
  );
}

export const QUESTION_CATALOGUE: QuestionDefinition[] = [
  {
    id: 'Q00',
    version: 1,
    section: 'field',
    sectionLabel: 'Field & Scope',
    title: 'Profile Action',
    farmerQuestion: 'Are you creating a new field profile or updating an existing one?',
    explanation: 'Creating starts a clean field record without copying unrelated history; editing preserves earlier snapshots.',
    whyWeAsk: 'Keeping each field profile distinct ensures soil tests, boundaries, and crop rotations never cross-contaminate between fields.',
    required: true,
    allowsUnknown: false,
    controlType: 'mode_select',
    options: [
      { value: 'create', label: 'Create a new profile', description: 'Allocate a fresh farm & field identity with blank answers.' },
      { value: 'edit', label: 'Edit an existing field', description: 'Load saved answers for an existing field while keeping history.' },
    ],
  },
  {
    id: 'Q01',
    version: 1,
    section: 'field',
    sectionLabel: 'Field & Scope',
    title: 'Farm Identity',
    farmerQuestion: 'Which farm is this field part of?',
    explanation: 'Choose an existing farm from your portfolio or add a new farm name and optional note.',
    whyWeAsk: 'A farm groups one or more individual fields while keeping soil, water, and crop records field-specific.',
    required: true,
    allowsUnknown: false,
    controlType: 'farm_select',
  },
  {
    id: 'Q02',
    version: 1,
    section: 'field',
    sectionLabel: 'Field & Scope',
    title: 'Field Selection',
    farmerQuestion: 'Which field do you want to plan for?',
    explanation: 'Select a specific field to update, add a new field block, or choose one managed area for the whole farm.',
    whyWeAsk: 'Soil texture, drainage, and crop history vary block by block; assessing one field at a time prevents misleading averages.',
    required: true,
    allowsUnknown: false,
    controlType: 'field_select',
    dependsOn: ['Q00', 'Q01'],
  },
  {
    id: 'Q03',
    version: 1,
    section: 'field',
    sectionLabel: 'Field & Scope',
    title: 'Field Name',
    farmerQuestion: 'Give this field a name so you can recognise it.',
    explanation: 'For example: North Field, Lower River Bench, or Plot 2.',
    whyWeAsk: 'Clear field labels keep recommendations and future lab logs attached to the exact parcel you intend.',
    required: true,
    allowsUnknown: false,
    controlType: 'short_text',
    dependsOn: ['Q02'],
  },
  {
    id: 'Q04',
    version: 1,
    section: 'field',
    sectionLabel: 'Field & Scope',
    title: 'Land & System Type',
    farmerQuestion: 'What best describes this growing area?',
    explanation: 'Select the production system used on this parcel.',
    whyWeAsk: 'Annual open-field rotations follow different crop duration and transition rules than orchards, greenhouses, or pastures.',
    required: true,
    allowsUnknown: true,
    unknownLabel: 'Not sure',
    controlType: 'single_select',
    options: [
      { value: 'open_field', label: 'Open field', description: 'Annual row crops, cereals, pulses, or field vegetables.' },
      { value: 'orchard_perennial', label: 'Orchard or perennial planting', description: 'Multi-year tree, vine, or perennial stands.' },
      { value: 'greenhouse_protected', label: 'Greenhouse or protected growing', description: 'High-tunnel or climate-buffered growing space.' },
      { value: 'mixed_intercropped', label: 'Mixed or intercropped area', description: 'Multiple species grown simultaneously in strips or mixtures.' },
      { value: 'pasture_forage', label: 'Pasture or forage', description: 'Grazed swards or cut forage stands.' },
      { value: 'other', label: 'Other system', description: 'Specify your custom growing arrangement.' },
    ],
    invalidatesDownstream: ['Q29', 'Q30'],
  },
  {
    id: 'Q05',
    version: 1,
    section: 'field',
    sectionLabel: 'Location & Boundary',
    title: 'Field Location Pin',
    farmerQuestion: 'Search for the farm, use your device location, or place a pin on the map.',
    explanation: 'We never guess your farm from an IP address — please confirm the exact location pin.',
    whyWeAsk: 'Verified latitude and longitude are required to fetch local weather forecasts, NASA POWER daily climate data, and timezone.',
    required: true,
    allowsUnknown: false,
    controlType: 'location_picker',
    invalidatesDownstream: ['Q08', 'Q09'],
  },
  {
    id: 'Q06',
    version: 1,
    section: 'field',
    sectionLabel: 'Location & Boundary',
    title: 'Field Boundary',
    farmerQuestion: 'Can you outline the area you actually farm?',
    explanation: 'Drawing a closed polygon computes geodesic area accurately; you can skip this for a location-only check.',
    whyWeAsk: 'A map pin marks a point, whereas a boundary polygon defines farmed hectares and validates whether gridded data fits field scale.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'I only know the general location',
    controlType: 'boundary_polygon',
    dependsOn: ['Q05'],
    invalidatesDownstream: ['Q07'],
  },
  {
    id: 'Q07',
    version: 1,
    section: 'field',
    sectionLabel: 'Location & Boundary',
    title: 'Field Size',
    farmerQuestion: 'Do you know the field’s area?',
    explanation: 'Enter the farmed area with its unit; if a boundary polygon was drawn, we show its geodesic calculation as a suggestion.',
    whyWeAsk: 'Field area converts volumetric irrigation budgets (m³ or litres) into crop-usable millimetres across the parcel.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Not sure',
    controlType: 'area_unit',
    dependsOn: ['Q06'],
  },
  {
    id: 'Q08',
    version: 1,
    section: 'field',
    sectionLabel: 'Location & Boundary',
    title: 'Local Timezone',
    farmerQuestion: 'Is this the correct local time zone for the field?',
    explanation: 'Confirm the IANA timezone resolved from your field coordinates or pick a different region.',
    whyWeAsk: 'Local day boundaries keep daily GDD accumulations, rainfall totals, and planting calendars aligned with your field clock.',
    required: true,
    allowsUnknown: false,
    controlType: 'timezone_select',
    dependsOn: ['Q05'],
  },
  {
    id: 'Q09',
    version: 1,
    section: 'soil',
    sectionLabel: 'Soil & Land',
    title: 'Soil Texture',
    farmerQuestion: 'Which soil feels closest to the soil in this field?',
    explanation: 'Use the simple hand-feel guide below; choose "I don’t know" if you have not checked.',
    whyWeAsk: 'Texture governs water-holding capacity, infiltration speed, and root zone suitability across crops.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'I don’t know',
    controlType: 'soil_texture',
    options: [
      { value: 'sand', label: 'Sand', description: 'Very gritty, loose grains; does not hold a ball when squeezed.' },
      { value: 'loamy_sand', label: 'Loamy sand', description: 'Mostly gritty; barely forms a fragile ball when moist.' },
      { value: 'sandy_loam', label: 'Sandy loam', description: 'Gritty feel but holds together weakly when squeezed moist.' },
      { value: 'loam', label: 'Loam', description: 'Even mix of grit, smooth silt, and slight stickiness; crumbles softly.' },
      { value: 'silt_loam', label: 'Silt loam', description: 'Smooth and floury when dry, silky when wet; weak short ribbon.' },
      { value: 'silt', label: 'Silt', description: 'Very smooth, powdery/soapy feel with minimal grit.' },
      { value: 'clay_loam', label: 'Clay loam', description: 'Moderately sticky when wet; presses into a firm ribbon 2–5 cm long.' },
      { value: 'clay', label: 'Clay', description: 'Very sticky and plastic when wet; forms a strong ribbon over 5 cm.' },
      { value: 'other', label: 'Other known texture', description: 'Peat, chalky, volcanic ash, or mixed gravel.' },
    ],
  },
  {
    id: 'Q10',
    version: 1,
    section: 'soil',
    sectionLabel: 'Soil & Land',
    title: 'Soil Test Availability',
    farmerQuestion: 'Have you tested this field’s soil?',
    explanation: 'If you have lab or probe results, we will ask only for the measurements you have.',
    whyWeAsk: 'Distinguishing actual field lab tests from unmeasured assumptions keeps evidence confidence honest.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Not sure',
    controlType: 'single_select',
    options: [
      { value: 'yes_full', label: 'Yes, I have results', description: 'Lab report or calibrated meter measurements available.' },
      { value: 'yes_partial', label: 'Yes, but only some results', description: 'For example pH only, or an older partial test.' },
      { value: 'no', label: 'No soil test yet', description: 'Continue without fabricating missing soil chemistry.' },
    ],
  },
  {
    id: 'Q11',
    version: 1,
    section: 'soil',
    sectionLabel: 'Soil & Land',
    title: 'Soil pH',
    farmerQuestion: 'What pH did your soil test show?',
    explanation: 'Include sample date, depth, and method where known so older tests are flagged appropriately.',
    whyWeAsk: 'Different crops have distinct optimal pH bands; acidity or alkalinity locks out nutrients or reduces legume nodulation.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Not measured in report',
    controlType: 'soil_ph',
    dependsOn: ['Q10'],
    visibleWhen: hasSoilTestResults,
  },
  {
    id: 'Q12',
    version: 1,
    section: 'soil',
    sectionLabel: 'Soil & Land',
    title: 'Soil Salinity (EC)',
    farmerQuestion: 'Did the test measure salinity or electrical conductivity (EC)?',
    explanation: 'EC readings require both a unit (dS/m, mS/cm, or µS/cm) and extraction method (e.g., 1:1, 1:5, or saturated paste).',
    whyWeAsk: 'Salinity limits sensitive legumes and maize long before barley or sorghum show osmotic stress.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Not measured',
    controlType: 'soil_ec',
    dependsOn: ['Q10'],
    visibleWhen: hasSoilTestResults,
  },
  {
    id: 'Q13',
    version: 1,
    section: 'soil',
    sectionLabel: 'Soil & Land',
    title: 'Organic Matter / Carbon',
    farmerQuestion: 'Did your soil report include organic matter or organic carbon?',
    explanation: 'Choose explicitly whether your lab reported Organic Matter (OM) or Organic Carbon (OC) — we keep them separate.',
    whyWeAsk: 'Organic matter and organic carbon use different laboratory scales (~1.724 conversion factor); keeping them distinct prevents silent error.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Not measured',
    controlType: 'soil_organic',
    dependsOn: ['Q10'],
    visibleWhen: hasSoilTestResults,
  },
  {
    id: 'Q14',
    version: 1,
    section: 'soil',
    sectionLabel: 'Soil & Land',
    title: 'Soil Nutrients (N, P, K)',
    farmerQuestion: 'Do you have nitrogen, phosphorus or potassium results?',
    explanation: 'Select any nutrients reported along with their chemical form, unit, and extraction method.',
    whyWeAsk: 'Nutrient forms (e.g., Olsen P vs. Bray P1, NO₃-N vs. total N) are not directly interchangeable without method metadata.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Not measured',
    controlType: 'soil_nutrients',
    dependsOn: ['Q10'],
    visibleWhen: hasSoilTestResults,
  },
  {
    id: 'Q15',
    version: 1,
    section: 'soil',
    sectionLabel: 'Soil & Land',
    title: 'Field Drainage',
    farmerQuestion: 'After heavy rain or irrigation, what usually happens?',
    explanation: 'Choose how quickly surface moisture drains from this parcel.',
    whyWeAsk: 'Prolonged waterlogging harms root respiration for pulses, winter cereals, and maize.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Not sure',
    controlType: 'single_select',
    options: [
      { value: 'drains_quickly', label: 'Drains quickly', description: 'Water disappears rapidly with little surface ponding.' },
      { value: 'drains_normally', label: 'Drains normally', description: 'Soaks in steadily within a few hours without saturation.' },
      { value: 'stays_wet_long', label: 'Stays wet for a long time', description: 'Subsoil remains saturated for 2+ days after rain.' },
      { value: 'pools_waterlogs', label: 'Water pools or waterlogs', description: 'Standing water collects in low spots or wheel tracks.' },
      { value: 'varies_by_area', label: 'Varies by area', description: 'Drainage differs across zones in the same field.' },
    ],
  },
  {
    id: 'Q16',
    version: 1,
    section: 'soil',
    sectionLabel: 'Soil & Land',
    title: 'Land Limitations',
    farmerQuestion: 'Do you know of any of these conditions in this field?',
    explanation: 'Select any known physical constraints along with severity and whether it affects the whole field or a specific zone.',
    whyWeAsk: 'Hardpan, steep slopes, or saline patches explain localized stress that satellite grids cannot see.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Not sure',
    controlType: 'soil_limitations',
  },
  {
    id: 'Q17',
    version: 1,
    section: 'water',
    sectionLabel: 'Water & Irrigation',
    title: 'Water Access Mode',
    farmerQuestion: 'How does this field normally receive water?',
    explanation: 'Your answer controls whether irrigation questions are shown next.',
    whyWeAsk: 'Rain-fed fields depend entirely on precipitation timing, whereas irrigated parcels depend on source reliability and pump capacity.',
    required: true,
    allowsUnknown: true,
    unknownLabel: 'Not sure',
    controlType: 'single_select',
    options: [
      { value: 'rainfall_only', label: 'Rainfall only', description: 'Purely rain-fed with no supplemental irrigation infrastructure.' },
      { value: 'irrigation_only', label: 'Irrigation only', description: 'Crop water comes primarily from managed irrigation.' },
      { value: 'both', label: 'Both rainfall and irrigation', description: 'Rain-fed base with supplemental irrigation when needed.' },
      { value: 'other', label: 'Other water source', description: 'Subsurface water table, flood recession, or seasonal runoff.' },
    ],
    invalidatesDownstream: ['Q18', 'Q19', 'Q20', 'Q21', 'Q22', 'Q23', 'Q24'],
  },
  {
    id: 'Q18',
    version: 1,
    section: 'water',
    sectionLabel: 'Water & Irrigation',
    title: 'Irrigation Source',
    farmerQuestion: 'Where does irrigation water come from?',
    explanation: 'Select one or more water supply sources feeding this field.',
    whyWeAsk: 'Supply source determines vulnerability to groundwater drawdown, canal rationing, or salinity.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Unknown source',
    controlType: 'multi_select',
    dependsOn: ['Q17'],
    visibleWhen: hasIrrigationAccess,
    options: [
      { value: 'well_groundwater', label: 'Well / groundwater' },
      { value: 'river_stream', label: 'River or stream' },
      { value: 'canal', label: 'Canal' },
      { value: 'reservoir_pond', label: 'Reservoir or farm pond' },
      { value: 'treated_reclaimed', label: 'Treated / reclaimed water' },
      { value: 'desalinated', label: 'Desalinated supply' },
      { value: 'purchased_trucked', label: 'Purchased / trucked water' },
      { value: 'other', label: 'Other source' },
    ],
  },
  {
    id: 'Q19',
    version: 1,
    section: 'water',
    sectionLabel: 'Water & Irrigation',
    title: 'Irrigation Method',
    farmerQuestion: 'How is irrigation applied?',
    explanation: 'Choose the primary application system used on this field.',
    whyWeAsk: 'Application method provides context for distribution uniformity and evaporation loss.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Unknown method',
    controlType: 'single_select',
    dependsOn: ['Q17'],
    visibleWhen: hasIrrigationAccess,
    options: [
      { value: 'drip', label: 'Drip irrigation', description: 'Surface emitters along plant rows.' },
      { value: 'subsurface_drip', label: 'Subsurface drip', description: 'Buried drip lines reducing surface evaporation.' },
      { value: 'sprinkler', label: 'Sprinkler', description: 'Portable or solid-set overhead sprinklers.' },
      { value: 'centre_pivot', label: 'Centre pivot', description: 'Mechanised rotating lateral span.' },
      { value: 'surface_furrow', label: 'Surface or furrow', description: 'Gravity-fed channels between ridges.' },
      { value: 'basin_flood', label: 'Basin / flood', description: 'Levelled check basins or border strips.' },
      { value: 'manual_hose_can', label: 'Manual hose / watering can', description: 'Hand-applied spot irrigation.' },
      { value: 'varies', label: 'Varies by crop or zone', description: 'Mixed systems across the season.' },
      { value: 'other', label: 'Other method' },
    ],
  },
  {
    id: 'Q20',
    version: 1,
    section: 'water',
    sectionLabel: 'Water & Irrigation',
    title: 'Supply Reliability',
    farmerQuestion: 'Can you usually get enough irrigation water when the crop needs it?',
    explanation: 'Describe real-world reliability during peak summer demand.',
    whyWeAsk: 'High-ET crops like maize face yield penalties if supply is rationed during flowering.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Not sure',
    controlType: 'single_select',
    dependsOn: ['Q17'],
    visibleWhen: hasIrrigationAccess,
    options: [
      { value: 'reliable', label: 'Reliable throughout the season', description: 'Water is available whenever scheduled.' },
      { value: 'usually_reliable', label: 'Usually reliable with occasional limits', description: 'Minor delays only during peak regional demand.' },
      { value: 'restricted_dry', label: 'Restricted during dry periods', description: 'Cutbacks occur in mid/late summer.' },
      { value: 'unreliable_rationed', label: 'Unreliable or rationed', description: 'Frequent quotas, canal rotations, or low well recovery.' },
      { value: 'highly_variable', label: 'Highly variable', description: 'Depends heavily on pumping power or upstream releases.' },
    ],
  },
  {
    id: 'Q21',
    version: 1,
    section: 'water',
    sectionLabel: 'Water & Irrigation',
    title: 'Seasonal Water Limit',
    farmerQuestion: 'Are you limited by a water allocation, pump capacity or a fixed seasonal amount?',
    explanation: 'If you know the cap, specify both the unit and time basis (e.g., m³ per season or mm over field).',
    whyWeAsk: 'A bare number without a unit and time window cannot be used safely as a water budget constraint.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Not sure',
    controlType: 'water_limit',
    dependsOn: ['Q17'],
    visibleWhen: (d) => hasIrrigationAccess(d) || getAnswerValue<string>(d, 'Q17') === 'other',
  },
  {
    id: 'Q22',
    version: 1,
    section: 'water',
    sectionLabel: 'Water & Irrigation',
    title: 'Normal Irrigation Routine',
    farmerQuestion: 'What is your normal irrigation routine?',
    explanation: 'This records your planned routine (not proof of actual water applied on specific dates).',
    whyWeAsk: 'We separate planned routines from measured irrigation logs so water-balance totals stay truthful.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'No fixed routine / unknown',
    controlType: 'irrigation_routine',
    dependsOn: ['Q17'],
    visibleWhen: hasIrrigationAccess,
  },
  {
    id: 'Q23',
    version: 1,
    section: 'water',
    sectionLabel: 'Water & Irrigation',
    title: 'Amount Applied Per Irrigation',
    farmerQuestion: 'Do you know roughly how much water is applied in one irrigation?',
    explanation: 'Enter mm, m³, litres, or flow rate + runtime — or choose "Not measured" if you do not meter applications.',
    whyWeAsk: 'Without metered depth or flow rate + field area, the engine marks applied millimetres unavailable rather than guessing.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Not measured',
    controlType: 'irrigation_amount',
    dependsOn: ['Q17'],
    visibleWhen: hasIrrigationAccess,
  },
  {
    id: 'Q24',
    version: 1,
    section: 'water',
    sectionLabel: 'Water & Irrigation',
    title: 'Irrigation Water Quality',
    farmerQuestion: 'Has the irrigation water ever caused salinity or quality problems?',
    explanation: 'If tested in a lab or with an EC meter, enter the measured EC and date.',
    whyWeAsk: 'Saline irrigation water narrows safe crop choices and increases leaching requirements.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Not sure',
    controlType: 'water_quality',
    dependsOn: ['Q17'],
    visibleWhen: hasIrrigationAccess,
  },
  {
    id: 'Q25',
    version: 1,
    section: 'history',
    sectionLabel: 'Crop History',
    title: 'Recent Crops Grown',
    farmerQuestion: 'What crops have been grown here over the last few seasons?',
    explanation: 'Add up to 5 recent seasons (supporting multiple crops per calendar year), or tell us if the field is new or unknown.',
    whyWeAsk: 'Past botanical families drive pathogen carry-over, return-interval rules, and residual nitrogen context.',
    required: true,
    allowsUnknown: true,
    unknownLabel: 'I don’t remember',
    controlType: 'crop_history',
    invalidatesDownstream: ['Q26', 'Q28'],
  },
  {
    id: 'Q26',
    version: 1,
    section: 'history',
    sectionLabel: 'Crop History',
    title: 'Fallow & Cover Crop History',
    farmerQuestion: 'Were any seasons left without a cash crop, or planted mainly to cover/protect the soil?',
    explanation: 'We store Fallow (unplanted moisture rest) and Cover Crop (living cover) as separate agronomic states.',
    whyWeAsk: 'Fallow conserves water via low transpiration while cover crops add living root biomass and fix nitrogen; they are never the same choice.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Unknown',
    controlType: 'fallow_cover',
    dependsOn: ['Q25'],
  },
  {
    id: 'Q27',
    version: 1,
    section: 'history',
    sectionLabel: 'Crop History',
    title: 'Current Crop Status',
    farmerQuestion: 'Is a crop planted in the field right now?',
    explanation: 'Only confirm a crop that is genuinely planted on the ground today (never a planned or recommended crop).',
    whyWeAsk: 'The rotation sequence must start after your actual current crop finishes, without overwriting active field occupancy.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Not sure',
    controlType: 'current_crop',
  },
  {
    id: 'Q28',
    version: 1,
    section: 'history',
    sectionLabel: 'Crop History',
    title: 'Recurring Pests & Diseases',
    farmerQuestion: 'Have particular pests or diseases repeatedly affected this field?',
    explanation: 'Record any recurring problem, host crop, and season if known.',
    whyWeAsk: 'Verified crop-host pressures trigger minimum break intervals before susceptible families can return.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Uncertain / prefer not to say',
    controlType: 'pest_disease',
  },
  {
    id: 'Q29',
    version: 1,
    section: 'planning',
    sectionLabel: 'Planning Calendar',
    title: 'Planning Horizon',
    farmerQuestion: 'How many growing seasons should we plan for?',
    explanation: 'Choose the exact number of seasons, calendar years, or growing cycles ahead.',
    whyWeAsk: 'A 3-, 4-, or 5-season horizon balances short-term crop returns against full botanical family return intervals.',
    required: true,
    allowsUnknown: false,
    controlType: 'planning_horizon',
    invalidatesDownstream: ['Q32'],
  },
  {
    id: 'Q30',
    version: 1,
    section: 'planning',
    sectionLabel: 'Planning Calendar',
    title: 'Crops Per Typical Year',
    farmerQuestion: 'How many growing seasons or crop cycles can this field usually support in one year?',
    explanation: 'If more than one, clarify whether crops grow sequentially back-to-back or overlap as intercrops.',
    whyWeAsk: 'Double-cropping changes thermal time (GDD) budgets, transition windows, and annual water extraction.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Not sure',
    controlType: 'crops_per_year',
  },
  {
    id: 'Q31',
    version: 1,
    section: 'planning',
    sectionLabel: 'Planning Calendar',
    title: 'Planting & Harvest Windows',
    farmerQuestion: 'Are there fixed planting or harvest windows you need to follow?',
    explanation: 'Mark whether planting dates are flexible or constrained by contracts, labour, or weather.',
    whyWeAsk: 'Fixed operational deadlines act as hard transition feasibility gates during sequence generation.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Unknown',
    controlType: 'planting_windows',
  },
  {
    id: 'Q32',
    version: 1,
    section: 'constraints',
    sectionLabel: 'Constraints & Management',
    title: 'Required Crops',
    farmerQuestion: 'Are there any crops you definitely want included?',
    explanation: 'Select required crops or explicitly choose "None". Required crops are tested against hard agronomic rules first.',
    whyWeAsk: 'If a required crop violates salinity, climate, or exclusion constraints, the engine explains the conflict instead of forcing an invalid plan.',
    required: true,
    allowsUnknown: true,
    unknownLabel: 'Not sure',
    controlType: 'crop_multiselect',
  },
  {
    id: 'Q33',
    version: 1,
    section: 'constraints',
    sectionLabel: 'Constraints & Management',
    title: 'Excluded Crops',
    farmerQuestion: 'Are there any crops you want to avoid?',
    explanation: 'Confirmed exclusions are treated as hard constraints — those crops will never appear in candidate rotations.',
    whyWeAsk: 'Excluding unmarketable or unsuitable crops narrows the search space before any preference weighting runs.',
    required: true,
    allowsUnknown: false,
    controlType: 'crop_multiselect',
  },
  {
    id: 'Q34',
    version: 1,
    section: 'constraints',
    sectionLabel: 'Constraints & Management',
    title: 'Farming Practices',
    farmerQuestion: 'Which of these practices are typical for this field?',
    explanation: 'Select tillage, residue retention, nutrient sources, and pest management practices confirmed for this field.',
    whyWeAsk: 'Residue retention, no-till, and cover cropping affect evaporation, erosion buffering, and organic nitrogen cycling.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Not sure',
    controlType: 'multi_select',
    options: [
      { value: 'conventional_tillage', label: 'Conventional tillage' },
      { value: 'reduced_tillage', label: 'Reduced tillage' },
      { value: 'no_till', label: 'No-till / direct drill' },
      { value: 'compost_or_manure', label: 'Compost or manure' },
      { value: 'residue_retained', label: 'Crop residues retained' },
      { value: 'residues_removed', label: 'Crop residues removed / baled' },
      { value: 'green_manure', label: 'Green manure incorporated' },
      { value: 'cover_cropping', label: 'Cover cropping' },
      { value: 'synthetic_fertilizer', label: 'Synthetic fertilizer' },
      { value: 'organic_nutrient_inputs', label: 'Organic nutrient inputs' },
      { value: 'integrated_pest_management', label: 'Integrated pest management (IPM)' },
      { value: 'other', label: 'Other practice' },
    ],
  },
  {
    id: 'Q35',
    version: 1,
    section: 'constraints',
    sectionLabel: 'Constraints & Management',
    title: 'Fertiliser & Amendments',
    farmerQuestion: 'What nutrient or soil amendments are normally applied?',
    explanation: 'Record product type, approximate rate, unit, and timing if known — product names alone do not establish nutrient balances.',
    whyWeAsk: 'Accurate nutrient input rates prevent double-counting mineral fertilizer alongside legume N fixation.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Unknown / skip',
    controlType: 'fertilizer_detail',
    dependsOn: ['Q34'],
    visibleWhen: usesFertilisersOrAmendments,
  },
  {
    id: 'Q36',
    version: 1,
    section: 'constraints',
    sectionLabel: 'Constraints & Management',
    title: 'Operational Limits',
    farmerQuestion: 'Are there practical limits that affect what you can plant or when?',
    explanation: 'Note any equipment, labour, storage, or seed access limits for this field.',
    whyWeAsk: 'Practical bottlenecks are preserved in the snapshot so infeasible equipment transitions are flagged clearly.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Unknown',
    controlType: 'multi_select',
    options: [
      { value: 'none', label: 'No major operational limits' },
      { value: 'limited_labour', label: 'Limited labour availability' },
      { value: 'machinery_access', label: 'Machinery or planter/harvester access' },
      { value: 'planting_window', label: 'Tight planting window' },
      { value: 'harvest_window', label: 'Tight harvest window' },
      { value: 'storage', label: 'On-farm storage limits' },
      { value: 'seed_availability', label: 'Local seed availability' },
      { value: 'other', label: 'Other operational constraint' },
    ],
  },
  {
    id: 'Q37',
    version: 1,
    section: 'priorities',
    sectionLabel: 'Priorities & Risk',
    title: 'Primary Rotation Goal',
    farmerQuestion: 'What would make a rotation best for your farm?',
    explanation: 'Pick a documented preset profile or choose "Set my own priorities" to fine-tune the five weights.',
    whyWeAsk: 'Preferences rank feasible rotations without ever altering raw climate, soil, or hard agronomic safety gates.',
    required: true,
    allowsUnknown: false,
    controlType: 'priority_preset',
  },
  {
    id: 'Q38',
    version: 1,
    section: 'priorities',
    sectionLabel: 'Priorities & Risk',
    title: 'Fine-Tune Priority Weights',
    farmerQuestion: 'How important is each of these goals?',
    explanation: 'Adjust importance from 0 to 100; weights normalize to 100% on your review screen.',
    whyWeAsk: 'Explicitly weighting water efficiency, soil rebuilding, resilience, suitability, and output reveals real trade-offs.',
    required: false,
    allowsUnknown: false,
    controlType: 'priority_sliders',
    dependsOn: ['Q37'],
    visibleWhen: (draft) => {
      const q37 = getAnswerValue<{ presetId?: PriorityPresetId; customize?: boolean }>(draft, 'Q37');
      return q37?.presetId === 'custom' || Boolean(q37?.customize);
    },
  },
  {
    id: 'Q39',
    version: 1,
    section: 'priorities',
    sectionLabel: 'Priorities & Risk',
    title: 'Risk Comfort',
    farmerQuestion: 'Would you prefer a safer plan or are you comfortable with more uncertainty for a potentially stronger fit?',
    explanation: 'Risk preference adjusts ranking among feasible options without turning into a probability percentage.',
    whyWeAsk: 'Helps separate lower-variance drought-hardy options from higher-input candidates when evidence has gaps.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'Help me decide',
    controlType: 'single_select',
    options: [
      { value: 'cautious', label: 'Cautious — prefer safer stability', description: 'Favour drought-resilient crops and conservative water margins.' },
      { value: 'balanced', label: 'Balanced approach', description: 'Moderate trade-off between resilience and production.' },
      { value: 'higher_uncertainty', label: 'Willing to accept more uncertainty', description: 'Consider higher-output options if hard gates pass.' },
    ],
  },
  {
    id: 'Q40',
    version: 1,
    section: 'priorities',
    sectionLabel: 'Priorities & Yield',
    title: 'Previous Yield Records',
    farmerQuestion: 'Do you know the yield from previous seasons?',
    explanation: 'Optional: enter crop, season year, quantity, and exact unit (e.g., tonnes/ha). We never invent missing yields.',
    whyWeAsk: 'Observed field yields benchmark local productivity context cleanly without confusing suitability scores with yield predictions.',
    required: false,
    allowsUnknown: true,
    unknownLabel: 'No records / unknown',
    controlType: 'yield_history',
  },
  {
    id: 'Q41',
    version: 1,
    section: 'priorities',
    sectionLabel: 'Priorities & Yield',
    title: 'Budgets & Market Scope',
    farmerQuestion: 'Should we account for budget or market constraints?',
    explanation: 'Note whether cost or market constraints matter — financial optimization is reserved for a future data-supported release.',
    whyWeAsk: 'Rather than inventing fake prices or margins, we record your preference and transparently note current scope limits.',
    required: false,
    allowsUnknown: false,
    controlType: 'single_select',
    options: [
      { value: 'no', label: 'No — focus on agronomy, water & soil', description: 'Evaluate crop suitability, rotation breaks, and resource fit.' },
      { value: 'later', label: 'Later — flag for future economic module', description: 'Keep assessment free of unverified price assumptions.' },
      { value: 'yes', label: 'Yes — note financial sensitivity', description: 'Record note cleanly while keeping assessment non-financial.' },
    ],
  },
  {
    id: 'REVIEW',
    version: 1,
    section: 'review',
    sectionLabel: 'Review & Consent',
    title: 'Review & Remote Data Consent',
    farmerQuestion: 'Review your field snapshot and confirm data sources before running assessment.',
    explanation: 'Inspect every answer, provenance badge, and missing-data impact before saving or continuing.',
    whyWeAsk: 'Immutable input snapshots ensure old rotation reports always preserve the exact evidence used at run time.',
    required: true,
    allowsUnknown: false,
    controlType: 'review',
  },
];

export const QUESTION_BY_ID: Record<string, QuestionDefinition> = Object.fromEntries(
  QUESTION_CATALOGUE.map((q) => [q.id, q])
);

export const SIMPLE_QUESTION_CATALOGUE: QuestionDefinition[] = [
  {
    id: 'SIMPLE_1',
    version: 1,
    section: 'field',
    sectionLabel: 'Step 1 · Setup',
    title: 'Setup Choice',
    farmerQuestion: 'Add a new farm or add a field to an existing farm?',
    explanation: 'Pick whether to create a new farm or add a field to one you already saved.',
    whyWeAsk: 'Keeps each field tied to the right farm and location.',
    required: true,
    allowsUnknown: false,
    controlType: 'simple_entry_choice',
  },
  {
    id: 'SIMPLE_2',
    version: 1,
    section: 'field',
    sectionLabel: 'Step 2 · Name & Location',
    title: 'Name & Location',
    farmerQuestion: 'Name your farm and pick its location',
    explanation: 'Enter the name and drop a pin on the map.',
    whyWeAsk: 'Exact coordinates let us fetch real local weather, climate, and timezone data.',
    required: true,
    allowsUnknown: false,
    controlType: 'simple_name_location',
  },
  {
    id: 'SIMPLE_3',
    version: 1,
    section: 'history',
    sectionLabel: 'Step 3 · Recent Crops',
    title: 'Recent Crops',
    farmerQuestion: 'What grew here recently?',
    explanation: 'Add up to 3 recent seasons, or pick New field / Not sure.',
    whyWeAsk: 'Helps avoid planting the same crop family back-to-back.',
    required: true,
    allowsUnknown: true,
    unknownLabel: 'Not sure',
    controlType: 'simple_recent_crops',
  },
  {
    id: 'SIMPLE_4',
    version: 1,
    section: 'water',
    sectionLabel: 'Step 4 · Water Access',
    title: 'Water Access',
    farmerQuestion: 'How does this field get water?',
    explanation: 'Choose how water reaches your crops.',
    whyWeAsk: 'Helps match crop water needs with your supply.',
    required: true,
    allowsUnknown: true,
    unknownLabel: 'Not sure',
    controlType: 'simple_water',
  },
  {
    id: 'SIMPLE_5',
    version: 1,
    section: 'priorities',
    sectionLabel: 'Step 5 · Main Goal',
    title: 'Main Goal',
    farmerQuestion: 'What matters most for this plan?',
    explanation: 'Balanced plan is selected by default, or pick another priority.',
    whyWeAsk: 'Shapes how crop rotations are ranked for your field.',
    required: true,
    allowsUnknown: false,
    controlType: 'priority_preset',
  },
];

export const SIMPLE_QUESTION_BY_ID: Record<string, QuestionDefinition> = Object.fromEntries(
  SIMPLE_QUESTION_CATALOGUE.map((q) => [q.id, q])
);

export const ALL_QUESTION_BY_ID: Record<string, QuestionDefinition> = {
  ...QUESTION_BY_ID,
  ...SIMPLE_QUESTION_BY_ID,
};

export function isSimpleStep1Prefilled(draft: QuestionnaireDraft): boolean {
  const q01 = getAnswerValue<{ farmName?: string }>(draft, 'Q01');
  const q03 = getAnswerValue<string>(draft, 'Q03');
  return (
    draft.mode === 'edit' &&
    Boolean(draft.location?.confirmedByUser) &&
    Boolean(q01?.farmName?.trim()) &&
    Boolean(typeof q03 === 'string' && q03.trim())
  );
}

export function getSimpleModeRoute(draft: QuestionnaireDraft): QuestionDefinition[] {
  const skipEntryAndLocation =
    isSimpleStep1Prefilled(draft) &&
    draft.currentQuestionId !== 'SIMPLE_1' &&
    draft.currentQuestionId !== 'SIMPLE_2';
  const core = skipEntryAndLocation
    ? SIMPLE_QUESTION_CATALOGUE.slice(2)
    : SIMPLE_QUESTION_CATALOGUE;
  return [...core, QUESTION_BY_ID['REVIEW']];
}

export function selectHighImpactRefinementIds(draft: QuestionnaireDraft): string[] {
  const isIrrigated = hasIrrigationAccess(draft);
  const candidates: string[] = [
    'Q09', // Soil texture (feel-guide)
    'Q15', // Field drainage
    ...(isIrrigated ? ['Q19'] : []), // Irrigation method if irrigated
    'Q32', // Required crops
    'Q33', // Excluded crops
    'Q10', // Soil test availability
    'Q06', // Boundary polygon
    'Q30', // Crops per year
  ];

  const unanswered = candidates.filter((qId) => {
    if (qId === 'Q06') {
      return draft.geometry.geometryStatus !== 'polygon_verified';
    }
    const ans = draft.answers[qId];
    if (!ans) return true;
    return ans.sourceType === 'skipped';
  });

  return unanswered.slice(0, 3);
}

export function getVisibleQuestionRoute(draft: QuestionnaireDraft): QuestionDefinition[] {
  return QUESTION_CATALOGUE.filter((q) => {
    if (!q.visibleWhen) return true;
    try {
      return q.visibleWhen(draft);
    } catch {
      return true;
    }
  });
}

export const SIMPLE_COVERED_ADVANCED_IDS = new Set([
  'Q00',
  'Q01',
  'Q02',
  'Q03',
  'Q05',
  'Q08',
  'Q17',
  'Q25',
  'Q37',
]);

function isCoreSimpleQuestionAnswered(draft: QuestionnaireDraft, qId: string): boolean {
  if (qId === 'Q00' || qId === 'Q02') return true;
  if (qId === 'Q01') return Boolean(getAnswerValue<{ farmName?: string }>(draft, 'Q01')?.farmName?.trim());
  if (qId === 'Q03') {
    const val = getAnswerValue<string>(draft, 'Q03')?.trim() || '';
    if (draft.setupIntent === 'new_field_existing_farm') {
      return Boolean(val && val !== 'Primary Field');
    }
    return Boolean(val);
  }
  if (qId === 'Q05') return Boolean(draft.location?.confirmedByUser);
  if (qId === 'Q08') return Boolean(draft.location?.timezone || getAnswerValue<string>(draft, 'Q08'));
  if (qId === 'Q17') return Boolean(draft.answers['Q17']);
  if (qId === 'Q25') {
    const q25 = draft.answers['Q25']?.value as { mode?: string; records?: unknown[] } | undefined;
    if (!q25) return false;
    if (q25.mode === 'records') return Array.isArray(q25.records) && q25.records.length > 0;
    return true;
  }
  if (qId === 'Q37') return Boolean(getAnswerValue<{ presetId?: string }>(draft, 'Q37')?.presetId);
  return Boolean(draft.answers[qId]);
}

export function getDeeperAccuracyRoute(draft: QuestionnaireDraft): QuestionDefinition[] {
  return getVisibleQuestionRoute(draft).filter((q) => {
    if (q.id === 'REVIEW') return true;
    if (draft.currentQuestionId === q.id) return true;
    if (SIMPLE_COVERED_ADVANCED_IDS.has(q.id) && isCoreSimpleQuestionAnswered(draft, q.id)) {
      return false;
    }
    return true;
  });
}

export function getActiveQuestionRoute(draft: QuestionnaireDraft): QuestionDefinition[] {
  const exp = draft.experienceMode || 'simple';
  if (exp === 'advanced') {
    return getDeeperAccuracyRoute(draft);
  }
  if (exp === 'refinement') {
    const picked = (draft.refinementQuestionIds || [])
      .map((id) => QUESTION_BY_ID[id])
      .filter((q): q is QuestionDefinition => Boolean(q));
    return [...picked, QUESTION_BY_ID['REVIEW']];
  }
  return getSimpleModeRoute(draft);
}

export function getSectionProgressSummary(
  draft: QuestionnaireDraft,
  route: QuestionDefinition[],
  currentQuestionId: string
): Array<{
  key: QuestionnaireStageKey;
  label: string;
  shortLabel: string;
  status: 'completed' | 'current' | 'upcoming';
  answeredCount: number;
  totalCount: number;
}> {
  const currentIdx = route.findIndex((q) => q.id === currentQuestionId);
  const currentSection = route[currentIdx]?.section ?? 'field';
  const currentSectionOrder = QUESTION_SECTIONS.findIndex((s) => s.key === currentSection);

  return QUESTION_SECTIONS.map((sec, idx) => {
    const secQuestions = route.filter((q) => q.section === sec.key);
    const answeredCount = secQuestions.filter((q) => {
      if (q.id === 'REVIEW') return draft.status === 'completed';
      if (q.id === 'SIMPLE_1') {
        return Boolean(
          draft.setupIntent &&
            (draft.setupIntent === 'new_farm' ||
              Boolean(getAnswerValue<{ farmId?: string; mode?: string }>(draft, 'Q01')?.farmId &&
                getAnswerValue<{ mode?: string }>(draft, 'Q01')?.mode === 'existing'))
        );
      }
      if (q.id === 'Q05' || q.id === 'SIMPLE_2') return Boolean(draft.location);
      if (q.id === 'SIMPLE_3') return Boolean(draft.answers['Q25']);
      if (q.id === 'SIMPLE_4') return Boolean(draft.answers['Q17']);
      if (q.id === 'SIMPLE_5') return Boolean(draft.answers['Q37']);
      if (q.id === 'Q06') return draft.geometry.geometryStatus !== 'none' || Boolean(draft.answers['Q06']);
      return Boolean(draft.answers[q.id]);
    }).length;

    let status: 'completed' | 'current' | 'upcoming' = 'upcoming';
    if (sec.key === currentSection) status = 'current';
    else if (idx < currentSectionOrder || (secQuestions.length > 0 && answeredCount === secQuestions.length && idx < currentSectionOrder)) {
      status = 'completed';
    }

    return {
      key: sec.key,
      label: sec.label,
      shortLabel: sec.shortLabel,
      status,
      answeredCount,
      totalCount: secQuestions.length,
    };
  });
}
