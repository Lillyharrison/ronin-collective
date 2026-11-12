// Fail closed: only the owner's authoritative RPC can approve a candidate.
export async function clockEligiblePeople<T extends { id: string }>(
  people: T[],
  canClockIn: (id: string) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const eligible: T[] = [];
  for (const person of people) {
    const { data, error } = await canClockIn(person.id);
    if (error) throw error;
    if (data === true) eligible.push(person);
  }
  return eligible;
}