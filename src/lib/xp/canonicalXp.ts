export type CanonicalXpEvent = {
  id?: string | null;
  amount?: number | null;
  award_key?: string | null;
  completion_event_id?: string | null;
};

export function getCanonicalXpAwardBase(awardKey: string) {
  return awardKey
    .trim()
    .replace(/^reverse:/, "")
    .replace(/:(?:skill|mon|area):[^:]+$/, "");
}

function logicalIdentity(event: CanonicalXpEvent, index: number) {
  const awardKey = event.award_key?.trim();
  if (awardKey) {
    return `award:${getCanonicalXpAwardBase(awardKey)}`;
  }

  const completionEventId = event.completion_event_id?.trim();
  if (completionEventId) {
    return `completion:${completionEventId}`;
  }

  const eventId = event.id?.trim();
  return eventId ? `event:${eventId}` : `row:${index}`;
}

export function sumCanonicalXp(events: CanonicalXpEvent[]) {
  const reversedPositiveAwardKeys = new Set<string>();

  for (const event of events) {
    const awardKey = event.award_key?.trim();
    if (awardKey?.startsWith("reverse:")) {
      reversedPositiveAwardKeys.add(awardKey.slice("reverse:".length));
    }
  }

  const amountByIdentity = new Map<string, number>();

  events.forEach((event, index) => {
    const amount = Number(event.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    const awardKey = event.award_key?.trim();
    if (awardKey && reversedPositiveAwardKeys.has(awardKey)) {
      return;
    }

    const identity = logicalIdentity(event, index);
    const current = amountByIdentity.get(identity);
    if (current === undefined || amount > current) {
      amountByIdentity.set(identity, amount);
    }
  });

  return Array.from(amountByIdentity.values()).reduce(
    (total, amount) => total + amount,
    0
  );
}
