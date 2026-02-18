import { getYouTubeSignals } from "../infra/youtubeSignalClient.js";
import { scoreOpportunity } from "./opportunityService.js";
import { generateScript } from "./scriptService.js";
import { createDraftPublish } from "./publishService.js";

export async function runPipeline(topic, channelId = null, tenantId = "t_default") {
  const signals = await getYouTubeSignals(topic);

  const opportunity = scoreOpportunity(topic, signals);
  const script = generateScript({
    topic: opportunity.topic,
    opportunityScore: opportunity.opportunityScore
  });
  const publish = await createDraftPublish({
    topic: script.topic,
    script: script.script,
    channelId,
    tenantId
  });

  return {
    opportunity,
    script,
    publish
  };
}
