export function orderStage(status: string): "not_placed" | "placed" | "delivered" {
  if (status === "delivered") return "delivered";
  if (status === "placed" || status === "pending_delivery") return "placed";
  return "not_placed";
}