import {
  createChannel,
  ensureDefaultChannel,
  getChannelById,
  listChannels
} from "../infra/channelRepository.js";

export async function addChannel(input) {
  return createChannel(input);
}

export async function getChannelsByTenant(tenantId) {
  return listChannels(tenantId || "t_default");
}

export async function resolveChannelId(channelId = null, tenantId = "t_default") {
  const defaultChannel = await ensureDefaultChannel(tenantId);

  if (!channelId) {
    return defaultChannel.channelId;
  }

  const channel = await getChannelById(channelId, tenantId);
  if (!channel) {
    throw new Error("CHANNEL_NOT_FOUND");
  }

  return channel.channelId;
}
