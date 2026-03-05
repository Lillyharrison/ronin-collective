import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChecklistItemRow } from "./ChecklistItemRow";
import { ChecklistItem } from "@/hooks/useChecklists";

interface Props {
  item: ChecklistItem;
  isCompleted: boolean;
  isAdmin: boolean;
  completedAt?: string;
  onToggle: () => void;
  onUpdate: (id: string, changes: Partial<ChecklistItem>) => void;
  onDelete: (id: string) => void;
  onPhotoUpload: (id: string, url: string) => void;
}

export function SortableChecklistItem({ item, isAdmin, ...rest }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !isAdmin });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? ("relative" as const) : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <ChecklistItemRow
        item={item}
        isAdmin={isAdmin}
        dragHandleProps={isAdmin ? { ...attributes, ...listeners } : undefined}
        {...rest}
      />
    </div>
  );
}
