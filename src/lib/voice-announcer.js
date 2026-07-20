const ROLE_LINES = {
  Assassina: {
    challenge: [
      'assassina/challenge-received-01.mp3',
      'assassina/challenge-received-02.mp3',
      'assassina/challenge-received-03.mp3',
    ],
    proved: ['assassina/role-proved-01.mp3', 'assassina/role-proved-02.mp3'],
    lost: [
      'assassina/influence-lost-01.mp3',
      'assassina/influence-lost-02.mp3',
      'assassina/influence-lost-03.mp3',
      'assassina/influence-lost-04.mp3',
    ],
  },
  Capitão: {
    challenge: ['capitao/challenge-received-01.mp3', 'capitao/challenge-received-02.mp3'],
    proved: ['capitao/role-proved-01.mp3', 'capitao/role-proved-02.mp3'],
    lost: ['capitao/influence-lost-01.mp3', 'capitao/influence-lost-02.mp3'],
  },
  Condessa: {
    challenge: ['condessa/challenge-received-01.mp3', 'condessa/challenge-received-02.mp3'],
    proved: ['condessa/role-proved-01.mp3', 'condessa/role-proved-02.mp3', 'condessa/role-proved-03.mp3'],
    lost: ['condessa/influence-lost-01.mp3', 'condessa/influence-lost-02.mp3'],
  },
  Duque: {
    challenge: [
      'duque/challenge-received-01.mp3',
      'duque/challenge-received-02.mp3',
      'duque/challenge-received-03.mp3',
    ],
    proved: ['duque/role-proved-01.mp3', 'duque/role-proved-02.mp3'],
    lost: ['duque/influence-lost-01.mp3', 'duque/influence-lost-02.mp3'],
  },
  Embaixadora: {
    challenge: ['embaixadora/challenge-received-01.mp3', 'embaixadora/challenge-received-02.mp3'],
    proved: ['embaixadora/role-proved-01.mp3', 'embaixadora/role-proved-02.mp3', 'embaixadora/role-proved-03.mp3'],
    lost: ['embaixadora/influence-lost-01.mp3', 'embaixadora/influence-lost-02.mp3'],
  },
};

const ACTION_LINES = {
  assassinate: [
    'assassina/action-assassinate-01.mp3',
    'assassina/action-assassinate-02.mp3',
    'assassina/action-assassinate-03.mp3',
  ],
  exchange: [
    'embaixadora/action-exchange-01.mp3',
    'embaixadora/action-exchange-02.mp3',
    'embaixadora/action-exchange-03.mp3',
    'embaixadora/action-exchange-04.mp3',
    'embaixadora/action-exchange-05.mp3',
  ],
  steal: ['capitao/action-steal-01.mp3', 'capitao/action-steal-02.mp3', 'capitao/action-steal-03.mp3'],
  tax: [
    'duque/action-tax-01.mp3',
    'duque/action-tax-02.mp3',
    'duque/action-tax-03.mp3',
    'duque/action-tax-04.mp3',
    'duque/action-tax-05.mp3',
  ],
};

const BLOCK_LINES = {
  'Capitão:steal': ['capitao/block-steal-01.mp3', 'capitao/block-steal-02.mp3', 'capitao/block-steal-03.mp3'],
  'Condessa:assassinate': [
    'condessa/block-assassinate-01.mp3',
    'condessa/block-assassinate-02.mp3',
    'condessa/block-assassinate-03.mp3',
  ],
  'Duque:foreign_aid': ['duque/block-foreign-aid-01.mp3', 'duque/block-foreign-aid-02.mp3'],
  'Embaixadora:steal': ['embaixadora/block-steal-01.mp3', 'embaixadora/block-steal-02.mp3'],
};

const BLOCKED_ACTION_LINES = {
  assassinate: [
    'assassina/action-blocked-01.mp3',
    'assassina/action-blocked-02.mp3',
    'assassina/action-blocked-03.mp3',
  ],
  steal: ['capitao/action-blocked-01.mp3'],
};

export function configuredVoiceFiles() {
  const roleLines = Object.values(ROLE_LINES).flatMap((contexts) => Object.values(contexts).flat());
  return [
    ...new Set([
      ...roleLines,
      ...Object.values(ACTION_LINES).flat(),
      ...Object.values(BLOCK_LINES).flat(),
      ...Object.values(BLOCKED_ACTION_LINES).flat(),
    ]),
  ].sort();
}

const pick = (choices, random) => {
  if (!choices?.length) return null;
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
};

const eventKey = (entry) => JSON.stringify(entry);

export function newLogEntries(previous, next) {
  if (!previous?.log?.length || !next?.log?.length) return [];
  const previousKey = eventKey(previous.log.at(-1));
  const previousIndex = next.log.findLastIndex((entry) => eventKey(entry) === previousKey);
  if (previousIndex >= 0) return next.log.slice(previousIndex + 1);
  return eventKey(next.log.at(-1)) === previousKey ? [] : [next.log.at(-1)];
}

function filesForEvent(entry, random) {
  switch (entry.type) {
    case 'action_declared':
      return [pick(ACTION_LINES[entry.action], random)];
    case 'block_declared':
      return [pick(BLOCK_LINES[`${entry.role}:${entry.action}`], random)];
    case 'challenge_resolved': {
      const role = ROLE_LINES[entry.claimedRole];
      if (!entry.truthful) return [pick(role?.challenge, random)];
      const preferChallenge = random() < 0.35;
      const preferred = preferChallenge ? role?.challenge : role?.proved;
      const fallback = preferChallenge ? role?.proved : role?.challenge;
      return [pick(preferred, random) ?? pick(fallback, random)];
    }
    case 'action_blocked':
      return [pick(BLOCKED_ACTION_LINES[entry.action], random)];
    case 'influence_lost':
      return [pick(ROLE_LINES[entry.role]?.lost, random)];
    default:
      return [];
  }
}

export function voiceFilesForTransition(previous, next, random = Math.random) {
  const entries = newLogEntries(previous, next);
  const challenge = entries.find((entry) => entry.type === 'challenge_resolved');
  if (challenge) return filesForEvent(challenge, random).filter(Boolean).slice(0, 1);

  return entries
    .flatMap((entry) => filesForEvent(entry, random))
    .filter(Boolean)
    .slice(0, 1);
}
