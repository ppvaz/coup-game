export const CHAT_MAX_LENGTH = 200;
export const CHAT_HISTORY_LIMIT = 50;
export const CHAT_RATE_LIMIT = 5;
export const CHAT_RATE_WINDOW_MS = 8_000;
export const CHAT_COOLDOWN_MS = 15_000;

export function normalizeChatText(value) {
  const withoutControls = Array.from(String(value ?? ''), (character) => {
    const code = character.codePointAt(0);
    return code < 32 || code === 127 ? ' ' : character;
  }).join('');
  return Array.from(withoutControls.replace(/\s+/g, ' ').trim()).slice(0, CHAT_MAX_LENGTH).join('');
}

export function createChatGuard(options = {}) {
  const limit = options.limit ?? CHAT_RATE_LIMIT;
  const windowMs = options.windowMs ?? CHAT_RATE_WINDOW_MS;
  const cooldownMs = options.cooldownMs ?? CHAT_COOLDOWN_MS;
  const players = new Map();

  return {
    accept(playerId, value, now = Date.now()) {
      const text = normalizeChatText(value);
      if (!playerId || !text) return { ok: false, reason: 'empty', retryAfter: 0 };

      const activity = players.get(playerId) ?? { sentAt: [], blockedUntil: 0 };
      if (activity.blockedUntil > now) {
        return { ok: false, reason: 'cooldown', retryAfter: activity.blockedUntil - now };
      }
      activity.sentAt = activity.sentAt.filter((sentAt) => now - sentAt < windowMs);
      if (activity.sentAt.length >= limit) {
        activity.blockedUntil = now + cooldownMs;
        players.set(playerId, activity);
        return { ok: false, reason: 'cooldown', retryAfter: cooldownMs };
      }

      activity.sentAt.push(now);
      activity.blockedUntil = 0;
      players.set(playerId, activity);
      return { ok: true, text, retryAfter: 0 };
    },
  };
}

export function appendChatMessage(messages, message) {
  const text = normalizeChatText(message?.text);
  if (!message?.id || !message.playerId || !text || messages.some((candidate) => candidate.id === message.id)) {
    return messages;
  }
  return [...messages, { ...message, text }].slice(-CHAT_HISTORY_LIMIT);
}
