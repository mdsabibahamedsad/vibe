/**
 * Ad Service — Main Entry Point.
 *
 * Centralizes all ad system operations.
 * React components should never directly decide campaign eligibility,
 * targeting, or frequency caps — that's done server-side here.
 */
export { getActivePlacements } from "./campaign.service";
export {
  createCampaign,
  updateCampaign,
  getCampaign,
  listCampaigns,
  approveCampaign,
  rejectCampaign,
  pauseCampaign,
  resumeCampaign,
  archiveCampaign,
} from "./campaign.service";

export {
  createCreative,
  updateCreativeStatus,
  getCreativesForCampaign,
} from "./creative.service";

export {
  getEligibleAd,
  serveAd,
} from "./delivery.service";

export {
  recordImpression,
  recordViewability,
} from "./impression.service";

export {
  recordClick,
  resolveClickDestination,
} from "./click.service";

export {
  getCampaignMetrics,
  getAdvertiserMetrics,
  getGlobalMetrics,
} from "./revenue.service";
