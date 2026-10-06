// The one public surface of `#agent-runtime/internal/channels/index.js`.
//
// A channel author imports from here and nowhere else — the same entry point a first-party channel
// uses. That is the rule that keeps the plugin surface honest: if a channel needs something this file
// does not export, the export is missing rather than the channel being special.

export type {
  Channel,
  ChannelOutcome,
  ChannelPrincipal,
  InboundEvent,
  InboundRequest,
  ReplyTarget,
  RunOutcomeForChannel,
  RunSignal,
  SignalSubscription,
} from '#agent-runtime/internal/channels/channel/channel.js';
export type {
  BuildInboundRequestOptions,
  RawRequest,
} from '#agent-runtime/internal/channels/channel/inbound-request.js';
export {
  buildInboundRequest,
  streamModesFor,
} from '#agent-runtime/internal/channels/channel/inbound-request.js';
export type {
  BuildRegistryInput,
  ChannelConfig,
  ChannelRegistry,
  LoadedChannelExport,
  RegisteredChannel,
} from '#agent-runtime/internal/channels/channel/registry.js';
export { buildChannelRegistry } from '#agent-runtime/internal/channels/channel/registry.js';
export { channelRouteBindings } from '#agent-runtime/internal/channels/channel/route.js';
export {
  channelThreadMetadata,
  threadIdForChannelKey,
} from '#agent-runtime/internal/channels/channel/thread-id.js';
export type { Dispatcher } from '#agent-runtime/internal/channels/pipeline/deliver.js';
export { wrapChannelDispatcher } from '#agent-runtime/internal/channels/pipeline/deliver.js';
export type { PipelineDeps } from '#agent-runtime/internal/channels/pipeline/handle-event.js';
export { handleInboundEvent } from '#agent-runtime/internal/channels/pipeline/handle-event.js';
export type { ChannelDeliveryTarget } from '#agent-runtime/internal/channels/pipeline/reply-target.js';
export {
  CHANNEL_DELIVERY_SCHEME,
  isChannelDeliveryUrl,
  parseChannelDeliveryUrl,
  toChannelDeliveryUrl,
} from '#agent-runtime/internal/channels/pipeline/reply-target.js';
export type { DeliveryPayload } from '#agent-runtime/internal/channels/pipeline/resolve-reply.js';
export {
  resolveReply,
  toRunOutcome,
} from '#agent-runtime/internal/channels/pipeline/resolve-reply.js';
export type { RunPlan } from '#agent-runtime/internal/channels/pipeline/resolve-run.js';
export { resolveRunPlan } from '#agent-runtime/internal/channels/pipeline/resolve-run.js';
export type { RunFrames } from '#agent-runtime/internal/channels/pipeline/signals.js';
export { fanOutRunSignals } from '#agent-runtime/internal/channels/pipeline/signals.js';
export type {
  ChannelDestinationDelivery,
  ChannelDestinationIntent,
} from '#agent-runtime/internal/channels/routing/routed-channel.js';
export {
  composeRoutedChannel,
  declareChannelDestinationDelivery,
} from '#agent-runtime/internal/channels/routing/routed-channel.js';
