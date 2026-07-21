export type VegaAssetSlot =
  | "avatarSmall"
  | "avatarMedium"
  | "avatarLarge"
  | "portrait"
  | "heroArtwork"
  | "neutral"
  | "thinking"
  | "researching"
  | "presenting"
  | "success"
  | "warning"
  | "darkBackgroundVersion"
  | "lightBackgroundVersion"
  | "monochromeMark"
  | "favicon"
  | "appIcon";

// TODO: Replace fallback slots when approved Vega state artwork is exported.
const approvedVegaArtwork = "/vega-avatar.png";

export const vegaAssets: Record<VegaAssetSlot, string> = {
  avatarSmall: approvedVegaArtwork,
  avatarMedium: approvedVegaArtwork,
  avatarLarge: approvedVegaArtwork,
  portrait: approvedVegaArtwork,
  heroArtwork: approvedVegaArtwork,
  neutral: approvedVegaArtwork,
  thinking: approvedVegaArtwork,
  researching: approvedVegaArtwork,
  presenting: approvedVegaArtwork,
  success: approvedVegaArtwork,
  warning: approvedVegaArtwork,
  darkBackgroundVersion: approvedVegaArtwork,
  lightBackgroundVersion: approvedVegaArtwork,
  monochromeMark: approvedVegaArtwork,
  favicon: approvedVegaArtwork,
  appIcon: approvedVegaArtwork,
};
