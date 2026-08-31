import scraped from "../../data/scraped.json";
import overrides from "../../data/overrides.json";
import { mergeOverrides } from "./merge";
import type { Dataset, Overrides } from "./types";

/**
 * Les deux JSON sont importés statiquement : Vite les embarque dans le bundle,
 * ce qui garantit le critère « aucune requête réseau à l'exécution » (§8).
 */
export const dataset: Dataset = mergeOverrides(
  scraped as unknown as Dataset,
  overrides as unknown as Overrides,
);
