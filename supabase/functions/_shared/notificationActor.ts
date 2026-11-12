// Only validated caller identity may supply attribution; request payloads cannot.
export function notificationActor(callerId: string | null | undefined, serviceCall = false): string | null {
  return serviceCall ? null : callerId || null;
}