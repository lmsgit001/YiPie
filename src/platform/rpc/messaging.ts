import { defineExtensionMessaging } from '@webext-core/messaging';

import type { ProtocolMap } from '@/contract';

export const { sendMessage, onMessage } = defineExtensionMessaging<ProtocolMap>();
