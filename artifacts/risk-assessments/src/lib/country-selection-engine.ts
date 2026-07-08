// Operational Country Selection Engine (Index 3.0) - the single, permanent
// entry point for country selection. Every future consumer (mouse click,
// search, deep links, AI actions, the Camera Engine, Country Focus Engine,
// Operational Intelligence, User Presence, Operational Layers) selects
// through this module rather than holding its own selection state. This
// module only stores state and notifies subscribers - it never touches the
// DOM or the Operational Canvas, so selecting a country never causes a
// visual change by itself.
import type { CountryDefinition } from "./country-registry";

export type ActiveCountry = {
  iso2: string;
  iso3: string;
  name: string;
  geometry: string;
  boundingBox: CountryDefinition["boundingBox"];
  // Not present on CountryDefinition yet - reserved for the future Country
  // Focus Engine/Camera Engine to populate. Always undefined today.
  focusPoint?: { x: number; y: number };
  cameraTarget?: { x: number; y: number; zoom?: number };
};

type SelectionListener = (country: ActiveCountry | null) => void;

let activeCountry: ActiveCountry | null = null;
const listeners = new Set<SelectionListener>();

function toActiveCountry(country: CountryDefinition): ActiveCountry {
  return {
    iso2: country.iso2,
    iso3: country.iso3,
    name: country.name,
    geometry: country.svgPath,
    boundingBox: country.boundingBox,
  };
}

export function selectCountry(country: CountryDefinition): void {
  activeCountry = toActiveCountry(country);
  console.log("Operational Country Selected");
  console.log("ISO2:", activeCountry.iso2);
  console.log("ISO3:", activeCountry.iso3);
  console.log("Country Name:", activeCountry.name);
  listeners.forEach((listener) => listener(activeCountry));
}

export function clearSelection(): void {
  activeCountry = null;
  listeners.forEach((listener) => listener(activeCountry));
}

export function getSelectedCountry(): ActiveCountry | null {
  return activeCountry;
}

export function subscribe(listener: SelectionListener): void {
  listeners.add(listener);
}

export function unsubscribe(listener: SelectionListener): void {
  listeners.delete(listener);
}
